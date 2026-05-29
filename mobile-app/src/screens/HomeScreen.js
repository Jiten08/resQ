import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, PanResponder, Dimensions, Image, ActivityIndicator, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Clock, Activity, Check, User, ChevronRight, AlertTriangle, Mic, Camera, MapPin, X } from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../theme/theme';
import { Accelerometer } from 'expo-sensors';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import MapView, { Marker } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import Constants from 'expo-constants';
import { MockAssistantAPI } from '../services/MockAssistantAPI';
import { useProfile } from '../context/ProfileContext';

export default function HomeScreen() {
  const sliderWidthRef = useRef(0);
  const [isCancelled, setIsCancelled] = useState(false);
  const pan = useRef(new Animated.ValueXY()).current;
  const { profile } = useProfile();
  
  const [isAccidentTriggered, setIsAccidentTriggered] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [showCancelledOverlay, setShowCancelledOverlay] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  const [isAssistantActive, setIsAssistantActive] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState("Please attach a photo or record symptoms.");
  const [requiresPhoto, setRequiresPhoto] = useState(false);
  const [escalationData, setEscalationData] = useState(null);
  
  const isAccidentTriggeredRef = useRef(isAccidentTriggered);
  const isAssistantActiveRef = useRef(isAssistantActive);

  useEffect(() => {
    isAccidentTriggeredRef.current = isAccidentTriggered;
  }, [isAccidentTriggered]);

  useEffect(() => {
    isAssistantActiveRef.current = isAssistantActive;
  }, [isAssistantActive]);

  // New Voice Assistant Triage and Step-by-Step Guidance States
  const [steps, setSteps] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [isListeningForCommand, setIsListeningForCommand] = useState(false);
  const [isRecordingInitial, setIsRecordingInitial] = useState(false);
  const [initialCountdown, setInitialCountdown] = useState(5);
  const [capturedImageUri, setCapturedImageUri] = useState(null);

  // References to manage asynchronous loops and sound objects cleanly
  const soundRef = useRef(null);
  const recordingRef = useRef(null);
  const isListeningLoopActiveRef = useRef(false);
  
  // Peer coordination states
  const [deviceId] = useState(() => Math.random().toString(36).substring(7));
  const [peerFallAlert, setPeerFallAlert] = useState(null);
  const [peerRouteInfo, setPeerRouteInfo] = useState(null);
  const [location, setLocation] = useState(null);
  const wsRef = useRef(null);
  
  const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

  // Dynamically resolve WebSocket URL from Expo dev host IP
  const manifest = Constants.expoConfig || {};
  const hostUri = manifest.hostUri;
  const hostIp = hostUri ? hostUri.split(':')[0] : 'localhost';
  const WS_URL = `ws://${hostIp}:3000`;


  useEffect(() => {
    return () => {
      console.log("[HomeScreen] Cleaning up voice assistant resources on unmount...");
      isListeningLoopActiveRef.current = false;
      Speech.stop();
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);
  
  const KNOB_WIDTH = 44;
  
  const reportFallToPeers = async () => {
    try {
      let currentLoc = location || { coords: { latitude: 37.78825, longitude: -122.4324 } };

      const payload = {
        type: 'fall_alert',
        triggered: true,
        senderId: deviceId,
        senderName: profile?.name || 'Jiten',
        latitude: currentLoc.coords.latitude,
        longitude: currentLoc.coords.longitude,
        timestamp: Date.now()
      };

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
        console.log("Fall reported to peers via WebSocket successfully:", payload);
      } else {
        console.warn("WebSocket not connected. Fall reported fallback offline.");
      }
    } catch (e) {
      console.warn("Failed to report fall:", e);
    }
  };

  const handleCancelFall = async () => {
    try {
      const payload = {
        type: 'clear_alert',
        triggered: false,
        senderId: deviceId
      };
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
      }
    } catch (e) {}
  };

  const handleAcceptPeerAlert = () => {
    if (!peerFallAlert) return;
    const lat = peerFallAlert.latitude;
    const lng = peerFallAlert.longitude;
    const name = peerFallAlert.senderName;
    
    const scheme = Platform.select({
      ios: 'maps://app?daddr=',
      android: 'google.navigation:q='
    });
    const url = Platform.select({
      ios: `${scheme}${lat},${lng}&q=${encodeURIComponent(name)}`,
      android: `${scheme}${lat},${lng}`
    });

    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        Linking.openURL(webUrl);
      }
    });

    setPeerFallAlert(null);
    setPeerRouteInfo(null);
  };

  const handleCallAmbulance = async () => {
    try {
      // Trigger the SMS logic via backend
      const userName = profile?.name || 'User';
      await MockAssistantAPI.callAmbulance(userName);
      // Also open phone dialer for emergency
      Linking.openURL('tel:112');
    } catch (e) {
      console.warn("Failed to trigger ambulance SMS", e);
      Linking.openURL('tel:112'); // fallback
    }
  };

  const triggerAccident = () => {
    setIsAccidentTriggered(true);
    setCountdown(10);
    setIsCancelled(false);
    setAlertSent(false);
    pan.setValue({ x: 0, y: 0 }); 
  };

  useEffect(() => {
    Accelerometer.setUpdateInterval(400);
    const subscription = Accelerometer.addListener(data => {
      const { x, y, z } = data;
      const force = Math.sqrt(x*x + y*y + z*z);
      if (force > 3.0 && !isAccidentTriggeredRef.current) {
        triggerAccident();
      }
    });
    return () => subscription && subscription.remove();
  }, []);

  // Set up persistent WebSocket connection and fetch current location
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          let currentLoc = await Location.getCurrentPositionAsync({});
          setLocation(currentLoc);
        }
      } catch (e) {}
    })();

    let ws;
    let reconnectTimer;

    const connectWS = () => {
      console.log(`Connecting to ResQ WebSocket Relay at: ${WS_URL}`);
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to ResQ Local WebSocket Relay Server');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.triggered && data.senderId !== deviceId) {
            // Ignore incoming peer alerts if we are currently handling our own emergency
            if (!isAccidentTriggeredRef.current && !isAssistantActiveRef.current) {
              setPeerFallAlert(data);
            }
          } else if (data && !data.triggered) {
            setPeerFallAlert(null);
            setPeerRouteInfo(null);
          }
        } catch (e) {
          console.warn('Error parsing WS message:', e);
        }
      };

      ws.onclose = () => {
        console.log('ResQ WS Connection closed, retrying in 3s...');
        reconnectTimer = setTimeout(connectWS, 3000);
      };

      ws.onerror = (error) => {
        console.warn('ResQ WS Error:', error.message);
      };
    };

    connectWS();

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimer);
    };
  }, [deviceId]);

  useEffect(() => {
    let timer;
    if (isAccidentTriggered && countdown > 0 && !isCancelled) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (isAccidentTriggered && countdown === 0 && !isCancelled) {
      setIsAccidentTriggered(false);
      
      // Briefly show ALERT SENT overlay
      setAlertSent(true);
      setTimeout(() => setAlertSent(false), 3000);
      
      setIsAssistantActive(true);
      // Wait for user to manually press mic button
      reportFallToPeers();
    }
    return () => clearInterval(timer);
  }, [isAccidentTriggered, countdown, isCancelled]);

  const startAssistantFlow = async () => {
    console.log("[HomeScreen] Initialising Emergency Voice Assistant Flow...");
    setSteps(null);
    setCurrentStepIndex(0);
    setIsRecordingInitial(true);
    setInitialCountdown(5);
    setIsPlayingTTS(false);
    setIsListeningForCommand(false);
    isListeningLoopActiveRef.current = false;
    setAssistantMessage("Initialising audio recorder...");

    Speech.stop();
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (e) {}
      soundRef.current = null;
    }

    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldRouteThroughEarpieceAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      // Prepare and start high-quality WAV recording
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      await recording.startAsync();
      setAssistantMessage("🎤 Speak now! Tell me your emergency.");

      // Run 5-second countdown timer for triage speech capture
      let timer = 5;
      const interval = setInterval(async () => {
        timer -= 1;
        setInitialCountdown(timer);
        if (timer <= 0) {
          clearInterval(interval);
          await finishInitialRecordingAndProcess();
        }
      }, 1000);

    } catch (e) {
      console.error("[HomeScreen] Failed to start voice assistant recording:", e);
      setAssistantMessage("Failed to access voice recording hardware. Please verify permissions.");
      setIsRecordingInitial(false);
    }
  };

  const finishInitialRecordingAndProcess = async () => {
    try {
      setAssistantMessage("⏳ Processing emergency speech...");
      setIsRecordingInitial(false);

      if (!recordingRef.current) return;
      const recording = recordingRef.current;
      await recording.stopAndUnloadAsync();
      const audioUri = recording.getURI();
      recordingRef.current = null;

      // Disable recording mode to route stream playback through primary loudspeaker
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldRouteThroughEarpieceAndroid: false,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      console.log("[HomeScreen] Uploading audio to ResQ API:", audioUri);

      // Call processEmergency endpoint on FastAPI backend
      const userName = profile?.name || 'User';
      const response = await MockAssistantAPI.processEmergency(
        audioUri, 
        capturedImageUri, 
        'en-IN',
        userName
      );
      console.log("[HomeScreen] Backend emergency steps received:", response);

      if (response && response.steps && response.steps.length > 0) {
        setSteps(response.steps);
        setCurrentStepIndex(0);
        // Automatically play first step
        playStepTTS(response.steps[0], 0);
      } else {
        setAssistantMessage("Could not parse emergency guidance. Please end assistant and try again.");
      }
    } catch (err) {
      console.error("[HomeScreen] finishInitialRecordingAndProcess failed:", err);
      setAssistantMessage("Connection to ResQ API failed. Please ensure the backend is running.");
    }
  };

  const playStepTTS = async (text, index) => {
    // Stop listening loop and reset speaking state to prevent mic feedback
    isListeningLoopActiveRef.current = false;
    setIsListeningForCommand(false);
    setIsPlayingTTS(true);

    Speech.stop();
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) {}
      soundRef.current = null;
    }

    try {
      // Force audio output to route directly through speakerphone (disable allowsRecordingIOS temporarily)
      // We also temporarily disable background activity to force OS to re-evaluate audio routing.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldRouteThroughEarpieceAndroid: false,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      let voiceId = undefined;
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const indianVoices = voices.filter(v => 
          v.language.toLowerCase().startsWith('en-in') || 
          v.language.toLowerCase().startsWith('en_in')
        );
        
        // Look for "female", "veena" (iOS), "voice 1" or a network voice
        const preferred = indianVoices.find(v => 
          v.name.toLowerCase().includes('female') ||
          v.identifier.toLowerCase().includes('female') ||
          v.name.toLowerCase().includes('veena') ||
          v.name.toLowerCase().includes('1') ||
          v.identifier.toLowerCase().includes('1') ||
          v.identifier.toLowerCase().includes('network') 
        );
        
        if (preferred) {
          voiceId = preferred.identifier;
        } else if (indianVoices.length > 0) {
          voiceId = indianVoices[0].identifier;
        }
      } catch (err) {
        console.warn("[HomeScreen] Failed to fetch voices:", err);
      }

      Speech.speak(text, {
        language: 'en-IN',
        voice: voiceId,
        onDone: () => {
          console.log(`[HomeScreen] Step ${index + 1} speech finished. Activating commands listener...`);
          setIsPlayingTTS(false);
          startCommandListeningLoop(index);
        },
        onError: (error) => {
          console.error("[HomeScreen] playStepTTS failed:", error);
          setIsPlayingTTS(false);
          startCommandListeningLoop(index);
        }
      });
    } catch (e) {
      console.error("[HomeScreen] playStepTTS failed:", e);
      setIsPlayingTTS(false);
      startCommandListeningLoop(index);
    }
  };

  const startCommandListeningLoop = async (currentStepIdx) => {
    if (isListeningLoopActiveRef.current) return;
    isListeningLoopActiveRef.current = true;
    setIsListeningForCommand(true);

    console.log("[HomeScreen] Wake words listener active. Say 'Next' or 'Previous'...");
    let commandToExecute = null;

    try {
      while (isListeningLoopActiveRef.current) {
        // 1. Enable Recording Mode (allowsRecordingIOS: true)
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldRouteThroughEarpieceAndroid: false,
          playThroughEarpieceAndroid: false,
        });

        // Record small 2-second snippet
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync({
          android: {
            extension: '.wav',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidEncoder.AAC,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          ios: {
            extension: '.wav',
            audioQuality: Audio.IOSAudioQuality.HIGH,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 128000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {},
        });

        await recording.startAsync();
        
        // Listen window
        await new Promise((resolve) => setTimeout(resolve, 2000));

        if (!isListeningLoopActiveRef.current) {
          try {
            await recording.stopAndUnloadAsync();
          } catch(e){}
          break;
        }

        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();

        // 2. IMMEDIATELY Disable Recording Mode so audio streams play out of main speakerphone
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldRouteThroughEarpieceAndroid: false,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
        });

        // Check command via FastAPI
        try {
          const result = await MockAssistantAPI.checkCommand(uri);
          console.log("[HomeScreen] Wake word result:", result);

          if (result.command === 'next') {
            console.log("[HomeScreen] 'Next' command detected via voice!");
            commandToExecute = 'next';
            break; 
          } else if (result.command === 'previous') {
            console.log("[HomeScreen] 'Previous' command detected via voice!");
            commandToExecute = 'previous';
            break; 
          }
        } catch (err) {
          console.warn("[HomeScreen] Command upload failed:", err);
        }
      }
    } catch (e) {
      console.warn("[HomeScreen] Wake words listening loop exception:", e);
    } finally {
      // Guaranteed loop termination states
      isListeningLoopActiveRef.current = false;
      setIsListeningForCommand(false);

      // Execute voice navigation command only after background recording is fully closed and the loop has exited
      if (commandToExecute === 'next') {
        handleNextStep(currentStepIdx);
      } else if (commandToExecute === 'previous') {
        handlePreviousStep(currentStepIdx);
      }
    }
  };

  const handleNextStep = (indexVal = currentStepIndex) => {
    if (steps && indexVal < steps.length - 1) {
      const nextIndex = indexVal + 1;
      setCurrentStepIndex(nextIndex);
      playStepTTS(steps[nextIndex], nextIndex);
    }
  };

  const handlePreviousStep = (indexVal = currentStepIndex) => {
    if (steps && indexVal > 0) {
      const prevIndex = indexVal - 1;
      setCurrentStepIndex(prevIndex);
      playStepTTS(steps[prevIndex], prevIndex);
    }
  };

  const endAssistantFlow = async () => {
    console.log("[HomeScreen] Deactivating emergency assistant...");
    isListeningLoopActiveRef.current = false;
    setIsListeningForCommand(false);
    setIsPlayingTTS(false);
    setIsRecordingInitial(false);
    setSteps(null);
    setCapturedImageUri(null);
    setIsAssistantActive(false);
    handleCancelFall();
    
    Speech.stop();

    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (e) {}
      soundRef.current = null;
    }

    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {}
      recordingRef.current = null;
    }
  };

  const handleTakePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      alert("You've refused to allow this app to access your camera!");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.5,
    });

    if (!result.canceled) {
      console.log("[HomeScreen] Camera image captured:", result.assets[0].uri);
      setCapturedImageUri(result.assets[0].uri);
    }
  };
  
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (e, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (e, gestureState) => {
        const width = sliderWidthRef.current;
        if (!width) return;
        const maxSwipe = width - KNOB_WIDTH - 16; 
        
        if (gestureState.dx > 0 && gestureState.dx < maxSwipe) {
          pan.setValue({ x: gestureState.dx, y: 0 });
        } else if (gestureState.dx >= maxSwipe) {
          pan.setValue({ x: maxSwipe, y: 0 });
        } else {
          pan.setValue({ x: 0, y: 0 });
        }
      },
      onPanResponderRelease: (e, gestureState) => {
        const width = sliderWidthRef.current;
        if (!width) return;
        const maxSwipe = width - KNOB_WIDTH - 16;

        if (gestureState.dx > maxSwipe * 0.75) {
          Animated.spring(pan, {
            toValue: { x: maxSwipe, y: 0 },
            useNativeDriver: false,
          }).start(() => {
            setIsCancelled(true);
            setIsAccidentTriggered(false);
            setShowCancelledOverlay(true);
            handleCancelFall();
            setTimeout(() => {
              setShowCancelledOverlay(false);
              setIsCancelled(false);
              Animated.spring(pan, {
                toValue: { x: 0, y: 0 },
                useNativeDriver: false,
              }).start();
            }, 2500);
          });
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start(() => setIsCancelled(false));
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.container}>
      {isAccidentTriggered && (
        <View style={styles.accidentOverlay} pointerEvents="none">
          <AlertTriangle color={COLORS.textLight} size={64} style={{ marginBottom: 16 }} />
          <Text style={styles.accidentTitle}>ACCIDENT DETECTED</Text>
          <Text style={styles.accidentSubtitle}>Alerting emergency contacts in</Text>
          <Text style={styles.accidentCountdown}>{countdown}s</Text>
        </View>
      )}
      {showCancelledOverlay && (
        <View style={[styles.accidentOverlay, { backgroundColor: 'rgba(52, 199, 89, 0.95)' }]} pointerEvents="none">
          <Check color={COLORS.textLight} size={64} style={{ marginBottom: 16 }} />
          <Text style={styles.accidentTitle}>ALERT CANCELLED</Text>
          <Text style={styles.accidentSubtitle}>Emergency systems deactivated</Text>
        </View>
      )}
      {alertSent && (
        <View style={[styles.accidentOverlay, { backgroundColor: COLORS.primary }]} pointerEvents="box-none">
          <Activity color={COLORS.textLight} size={64} style={{ marginBottom: 16 }} />
          <Text style={styles.accidentTitle}>ALERT SENT</Text>
          <Text style={[styles.accidentSubtitle, { textAlign: 'center', paddingHorizontal: 20 }]}>
            Pinged 3 nearby devices requesting help. Emergency contacts notified.
          </Text>
          <TouchableOpacity 
            style={[styles.miniSosBtn, { backgroundColor: COLORS.text, marginTop: 24, paddingHorizontal: 24, paddingVertical: 12 }]} 
            onPress={() => {
              setAlertSent(false);
              handleCancelFall();
            }}
          >
            <Text style={[styles.miniSosText, { fontSize: 16 }]}>I'm Safe Now</Text>
          </TouchableOpacity>
        </View>
      )}

      {isAssistantActive && !escalationData && (
        <View style={[styles.accidentOverlay, { backgroundColor: '#121214', bottom: 0, borderRadius: 0 }]} pointerEvents="box-none">
          {/* 1. INITIAL TRIAGE AND SPEECH CAPTURE SETUP SCREEN */}
          {steps === null ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, width: '100%' }}>
              <Activity color={COLORS.primary} size={48} style={{ marginBottom: 24 }} />
              <Text style={styles.assistantTriageTitle}>AI EMERGENCY TRIAGE</Text>
              <Text style={styles.assistantTriageSubtitle}>Provide voice & visual details for rapid instructions</Text>

              {/* Triage Dashboard Container */}
              <View style={styles.triageDashboard}>
                
                {/* Photo Upload Section */}
                <View style={styles.triageCard}>
                  <Text style={styles.triageCardLabel}>1. ATTACH PHOTO (OPTIONAL)</Text>
                  {capturedImageUri ? (
                    <View style={styles.photoContainer}>
                      <Image source={{ uri: capturedImageUri }} style={styles.capturedPhoto} />
                      <TouchableOpacity style={styles.retakePhotoBtn} onPress={handleTakePhoto}>
                        <Camera color="#FFFFFF" size={16} style={{ marginRight: 6 }} />
                        <Text style={styles.retakePhotoBtnText}>Retake</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addPhotoBtn} onPress={handleTakePhoto}>
                      <Camera color={COLORS.primary} size={28} style={{ marginBottom: 8 }} />
                      <Text style={styles.addPhotoBtnText}>Add Injury Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Voice Input Section */}
                <View style={styles.triageCard}>
                  <Text style={styles.triageCardLabel}>2. STATE SYMPTOMS (5 SECONDS)</Text>
                  {isRecordingInitial ? (
                    <View style={styles.recordingCardActive}>
                      {/* Pulsing indicator */}
                      <View style={styles.pulsingMicWrapperActive}>
                        <Mic color="#FFFFFF" size={32} />
                      </View>
                      <Text style={styles.recordingCountdown}>{initialCountdown}s remaining</Text>
                      <Text style={styles.recordingAlertText}>Speak now...</Text>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.startVoiceBtn} onPress={startAssistantFlow}>
                      <View style={styles.micCircleInactive}>
                        <Mic color="#FFFFFF" size={28} />
                      </View>
                      <Text style={styles.startVoiceBtnText}>Start Speech Recording</Text>
                    </TouchableOpacity>
                  )}
                </View>

              </View>

              {/* Status Message Overlay Banner */}
              <View style={styles.triageStatusBanner}>
                <Text style={styles.triageStatusBannerText}>{assistantMessage}</Text>
              </View>

              {/* End / Cancel button */}
              <TouchableOpacity 
                style={styles.cancelTriageBtn} 
                onPress={endAssistantFlow}
              >
                <Text style={styles.cancelTriageBtnText}>Cancel Triage</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.endAssistantBtn, { backgroundColor: '#FF8C00', marginTop: 12 }]} 
                onPress={handleCallAmbulance}
              >
                <Text style={styles.endAssistantBtnText}>Call Ambulance</Text>
              </TouchableOpacity>
            </View>
          ) : (
            
            /* 2. PREMIUM VOICE & STEP GUIDANCE SCREEN */
            <View style={{ flex: 1, padding: 24, width: '100%', justifyContent: 'space-between', paddingTop: 50 }}>
              
              {/* Header Info */}
              <View style={{ alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <View style={styles.glowingActiveDot} />
                  <Text style={styles.assistantTriageTitle}>AI FIRST-AID RESPONDR</Text>
                </View>
                <Text style={styles.assistantTriageSubtitle}>Stay calm. Follow these steps sequentially.</Text>
              </View>

              {/* Visual Progress Bar Indicator */}
              <View style={styles.stepProgressContainer}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, width: '100%' }}>
                  <Text style={styles.stepCountText}>Step {currentStepIndex + 1} of {steps.length}</Text>
                  <Text style={styles.stepPercentText}>{Math.round(((currentStepIndex + 1) / steps.length) * 100)}% Complete</Text>
                </View>
                <View style={styles.stepProgressBg}>
                  <View style={[styles.stepProgressFill, { width: `${((currentStepIndex + 1) / steps.length) * 100}%` }]} />
                </View>
              </View>

              {/* Glassmorphic Step Guidance Text Card */}
              <View style={styles.guidanceCard}>
                <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
                  <Text style={styles.guidanceText}>{steps[currentStepIndex]}</Text>
                </ScrollView>
              </View>

              {/* Pulsing Glowing Mic Icon / Voice Status */}
              <View style={styles.micStatusContainer}>
                {isPlayingTTS ? (
                  <View style={styles.ttsSpeakingContainer}>
                    <View style={styles.speakingWaveWrapper}>
                      <Activity color={COLORS.primary} size="small" />
                    </View>
                    <Text style={styles.micStatusMessage}>Assistant is speaking...</Text>
                  </View>
                ) : isListeningForCommand ? (
                  <View style={styles.sttListeningContainer}>
                    <View style={styles.pulsingMicWrapperActiveMini}>
                      <Mic color="#FFFFFF" size={20} />
                    </View>
                    <Text style={styles.micStatusMessageActive}>Listening for 'Next' or 'Previous'...</Text>
                  </View>
                ) : (
                  <Text style={styles.micStatusMessage}>Voice engine idle</Text>
                )}
              </View>

              {/* Interactive Manual & Voice Action Controls */}
              <View style={styles.actionControlsRow}>
                {/* Previous Step Button */}
                <TouchableOpacity 
                  style={[styles.actionBtn, currentStepIndex === 0 && styles.actionBtnDisabled]} 
                  disabled={currentStepIndex === 0}
                  onPress={() => handlePreviousStep()}
                >
                  <Text style={styles.actionBtnText}>Previous</Text>
                </TouchableOpacity>

                {/* Repeat TTS Button */}
                <TouchableOpacity 
                  style={styles.actionBtnCenter}
                  onPress={() => playStepTTS(steps[currentStepIndex], currentStepIndex)}
                >
                  <View style={styles.actionBtnCenterInner}>
                    <Text style={styles.actionBtnCenterText}>Repeat Speech</Text>
                  </View>
                </TouchableOpacity>

                {/* Next Step Button */}
                <TouchableOpacity 
                  style={[styles.actionBtn, currentStepIndex === steps.length - 1 && styles.actionBtnDisabled]} 
                  disabled={currentStepIndex === steps.length - 1}
                  onPress={() => handleNextStep()}
                >
                  <Text style={styles.actionBtnText}>Next</Text>
                </TouchableOpacity>
              </View>

              {/* End Assistant Button */}
              <TouchableOpacity 
                style={styles.endAssistantBtn} 
                onPress={endAssistantFlow}
              >
                <Text style={styles.endAssistantBtnText}>I'm Safe Now · End Guide</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.endAssistantBtn, { backgroundColor: '#FF8C00', marginTop: 12 }]} 
                onPress={handleCallAmbulance}
              >
                <Text style={styles.endAssistantBtnText}>Call Ambulance</Text>
              </TouchableOpacity>

            </View>
          )}
        </View>
      )}

      {escalationData && (
        <View style={[styles.accidentOverlay, { backgroundColor: COLORS.primary, bottom: 0, borderRadius: 0 }]} pointerEvents="box-none">
          <View style={{ flex: 1, padding: 24, width: '100%', paddingTop: 60 }}>
            <AlertTriangle color={COLORS.textLight} size={48} style={{ alignSelf: 'center', marginBottom: 16 }} />
            <Text style={[styles.accidentTitle, { textAlign: 'center' }]}>AMBULANCE DISPATCHED</Text>
            <Text style={[styles.accidentSubtitle, { textAlign: 'center', marginBottom: 32 }]}>
              Help is on the way. ETA: {escalationData.eta}
            </Text>
            
            <View style={{ backgroundColor: COLORS.surface, borderRadius: 20, padding: 16, width: '100%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <MapPin color={COLORS.primary} size={24} style={{ marginRight: 12 }} />
                <View>
                  <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 16 }}>Routing to:</Text>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 14 }}>{escalationData.hospital.name}</Text>
                </View>
              </View>
              <Image 
                source={{ uri: `https://maps.geoapify.com/v1/staticmap?style=osm-bright-smooth&width=600&height=300&center=lonlat:${escalationData.hospital.longitude},${escalationData.hospital.latitude}&marker=lonlat:${escalationData.hospital.longitude},${escalationData.hospital.latitude};color:%23ff0000;size:medium&apikey=${process.env.EXPO_PUBLIC_GEOAPIFY_KEY}` }}
                style={{ width: '100%', height: 180, borderRadius: 12, backgroundColor: '#E8EDF2' }}
              />
            </View>

            <TouchableOpacity 
              style={[styles.miniSosBtn, { backgroundColor: COLORS.text, marginTop: 'auto', alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 16, width: '100%', alignItems: 'center', borderRadius: 16 }]} 
              onPress={() => {
                setEscalationData(null);
                setIsAssistantActive(false);
                handleCancelFall();
              }}
            >
              <Text style={[styles.miniSosText, { fontSize: 16 }]}>I'm Safe Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isAccidentTriggered && !showCancelledOverlay}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>Res<Text style={{fontWeight: '900'}}>QLink</Text></Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.miniSosBtn}>
              <Text style={styles.miniSosText}>SOS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}>
              <Bell color={COLORS.text} size={20} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}>
              <Clock color={COLORS.text} size={20} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <View>
            <Text style={styles.greeting}>Hello, {profile?.name ? profile.name.split(' ')[0] : 'User'}!</Text>
            <Text style={styles.subGreeting}>All systems active · Stay safe today</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}</Text>
          </View>
        </View>

        {/* Automated Safety Card */}
        <View style={styles.safetyCard}>
          <View style={styles.safetyHeader}>
            <View style={styles.safetyIconWrapper}>
              <Activity color={COLORS.primary} size={24} />
            </View>
            <View style={styles.safetyTitleWrapper}>
              <Text style={styles.safetySubtitle}>Fall Detection</Text>
              <Text style={styles.safetyTitle}>Automated Monitor</Text>
            </View>
            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.activeText}>Active</Text>
            </View>
          </View>

          <View style={styles.safetyStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>3</Text>
              <Text style={styles.statLabel}>Nearby Devices</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Check color={COLORS.textLight} size={24} style={{ marginBottom: 4 }} />
              <Text style={styles.statLabel}>Medical Profile</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{profile?.emergencyContacts?.length || 0}</Text>
              <Text style={styles.statLabel}>Contacts</Text>
            </View>
          </View>
        </View>

        {/* Big SOS Button */}
        <View style={styles.sosContainer}>
          <TouchableOpacity style={styles.bigSosButton} onPress={triggerAccident}>
            <View style={styles.sosInner}>
              <Text style={styles.bigSosText}>SOS</Text>
              <Text style={styles.bigSosSubtext}>TAP OR FALL</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Swipe to Cancel Slider */}
        <View 
          style={styles.sliderContainer}
          onLayout={(e) => { sliderWidthRef.current = e.nativeEvent.layout.width; }}
        >
          <Animated.View 
            style={[
              styles.sliderKnob,
              { transform: [{ translateX: pan.x }] },
              isCancelled && { backgroundColor: COLORS.success }
            ]}
            {...panResponder.panHandlers}
          >
            {isCancelled ? (
              <Check color={COLORS.textLight} size={20} />
            ) : (
              <ChevronRight color={COLORS.textSecondary} size={20} />
            )}
          </Animated.View>
          <Text style={[
            styles.sliderText,
            isCancelled && { color: COLORS.success }
          ]}>
            {isCancelled ? 'Alert Cancelled' : 'Swipe to Cancel Alert'}
          </Text>
        </View>

        {/* Communities Notified */}
        <View style={styles.communitiesCard}>
          <View style={styles.avatarsRow}>
            {['A', 'D', 'S'].map((initial, i) => (
              <View key={i} style={[styles.miniAvatar, { backgroundColor: ['#FF4D4D', '#007AFF', '#FFCC00'][i], left: i * 15, zIndex: 3 - i }]} >
                <Text style={styles.miniAvatarText}>{initial}</Text>
              </View>
            ))}
            <View style={[styles.miniAvatar, { backgroundColor: '#E5E5EA', left: 45, zIndex: 0 }]}>
              <Text style={[styles.miniAvatarText, { color: '#000' }]}>+</Text>
            </View>
          </View>
          <View style={styles.communitiesTextWrapper}>
            <Text style={styles.communitiesTitle}>Communities notified</Text>
            <Text style={styles.communitiesSubtitle}>Pre-verified escalation team alerted</Text>
          </View>
        </View>

      </ScrollView>

      {peerFallAlert && (
        <View style={styles.peerFallOverlay}>
          <SafeAreaView style={{ flex: 1, width: '100%', padding: 20 }}>
            <View style={styles.peerFallHeader}>
              <AlertTriangle color="#FF3B30" size={32} />
              <Text style={styles.peerFallTitle}>CRITICAL ALERT</Text>
              <Text style={styles.peerFallSubtitle}>
                {peerFallAlert.senderName} has detected a fall!
              </Text>
            </View>

            {/* Interactive Navigation Map */}
            <View style={styles.peerFallMapContainer}>
              {location ? (
                <MapView
                  style={StyleSheet.absoluteFillObject}
                  initialRegion={{
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    latitudeDelta: 0.04,
                    longitudeDelta: 0.04,
                  }}
                >
                  {/* Responder Marker */}
                  <Marker
                    coordinate={{
                      latitude: location.coords.latitude,
                      longitude: location.coords.longitude,
                    }}
                    title="You"
                    pinColor="blue"
                  />

                  {/* Victim Marker */}
                  <Marker
                    coordinate={{
                      latitude: peerFallAlert.latitude,
                      longitude: peerFallAlert.longitude,
                    }}
                    title={peerFallAlert.senderName}
                    pinColor="red"
                  />

                  {/* Routing Directions */}
                  {GOOGLE_API_KEY && (
                    <MapViewDirections
                      origin={{
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude,
                      }}
                      destination={{
                        latitude: peerFallAlert.latitude,
                        longitude: peerFallAlert.longitude,
                      }}
                      apikey={GOOGLE_API_KEY}
                      strokeWidth={4}
                      strokeColor="#FF3B30"
                      onReady={(result) => {
                        setPeerRouteInfo({
                          distance: result.distance.toFixed(1),
                          duration: Math.ceil(result.duration),
                        });
                      }}
                    />
                  )}
                </MapView>
              ) : (
                <ActivityIndicator size="large" color="#FF3B30" style={{ marginTop: 'auto', marginBottom: 'auto' }} />
              )}

              {peerRouteInfo && (
                <View style={styles.peerRouteCard}>
                  <View style={styles.peerRouteItem}>
                    <Clock size={16} color="#FF3B30" style={{ marginRight: 4 }} />
                    <Text style={styles.peerRouteValue}>{peerRouteInfo.duration} min</Text>
                  </View>
                  <View style={styles.peerRouteItem}>
                    <MapPin size={16} color="#007AFF" style={{ marginRight: 4 }} />
                    <Text style={styles.peerRouteValue}>{peerRouteInfo.distance} km</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Responder Actions */}
            <TouchableOpacity
              style={styles.peerAcceptBtn}
              onPress={handleAcceptPeerAlert}
            >
              <Text style={styles.peerAcceptBtnText}>I'm On My Way</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.peerDismissBtn}
              onPress={() => {
                setPeerFallAlert(null);
                setPeerRouteInfo(null);
              }}
            >
              <Text style={styles.peerDismissBtnText}>Dismiss</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SIZES.padding,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.padding,
  },
  logo: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  miniSosBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  miniSosText: {
    color: COLORS.textLight,
    fontWeight: '700',
    fontSize: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.padding,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  subGreeting: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: COLORS.textLight,
    fontSize: 20,
    fontWeight: '700',
  },
  safetyCard: {
    backgroundColor: COLORS.darkSurface,
    borderRadius: SIZES.largeRadius,
    padding: SIZES.padding,
    marginBottom: 40,
    ...SHADOWS.medium,
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  safetyIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 76, 76, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  safetyTitleWrapper: {
    flex: 1,
  },
  safetySubtitle: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  safetyTitle: {
    color: COLORS.textLight,
    fontSize: 16,
    fontWeight: '700',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 199, 89, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
    marginRight: 6,
  },
  activeText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: '700',
  },
  safetyStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2A2A2C',
    borderRadius: 16,
    padding: 16,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: COLORS.textLight,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    color: '#8E8E93',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#3A3A3C',
  },
  sosContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  bigSosButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 76, 76, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosInner: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
    shadowColor: COLORS.primary,
  },
  bigSosText: {
    color: COLORS.textLight,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 2,
  },
  bigSosSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  sliderContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 30,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 24,
    ...SHADOWS.light,
  },
  sliderKnob: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sliderText: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 16,
    marginRight: 44, // Offset knob width to keep text centered
  },
  communitiesCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    ...SHADOWS.light,
  },
  avatarsRow: {
    width: 80,
    height: 32,
    position: 'relative',
  },
  miniAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  miniAvatarText: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: '700',
  },
  communitiesTextWrapper: {
    flex: 1,
    marginLeft: 12,
  },
  communitiesTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  communitiesSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  accidentOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 220, // Leave space for slider at the bottom
    backgroundColor: 'rgba(255, 59, 48, 0.95)',
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    ...SHADOWS.medium,
  },
  accidentTitle: {
    color: COLORS.textLight,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  accidentSubtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  accidentCountdown: {
    color: COLORS.textLight,
    fontSize: 72,
    fontWeight: '900',
  },
  cameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.info,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    ...SHADOWS.medium,
  },
  cameraBtnText: {
    color: COLORS.textLight,
    fontWeight: '800',
    fontSize: 18,
  },
  peerFallOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#121214',
    zIndex: 1000,
  },
  peerFallHeader: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  peerFallTitle: {
    color: '#FF3B30',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 8,
  },
  peerFallSubtitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  peerFallMapContainer: {
    flex: 1,
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    marginVertical: 20,
  },
  peerRouteCard: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    flexDirection: 'row',
    paddingVertical: 16,
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  peerRouteItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  peerRouteValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 6,
  },
  peerAcceptBtn: {
    width: '100%',
    backgroundColor: '#FF3B30',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  peerAcceptBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  peerDismissBtn: {
    width: '100%',
    backgroundColor: '#2C2C2E',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  peerDismissBtnText: {
    color: '#AEAEB2',
    fontSize: 16,
    fontWeight: '700',
  },
  
  // Voice Assistant Visual Styles
  assistantTriageTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  assistantTriageSubtitle: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  triageDashboard: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    height: 240,
    marginTop: 32,
    marginBottom: 24,
  },
  triageCard: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  triageCardLabel: {
    color: '#AEAEB2',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  photoContainer: {
    width: '100%',
    height: 140,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  capturedPhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  retakePhotoBtn: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retakePhotoBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  addPhotoBtn: {
    flex: 1,
    width: '100%',
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#3A3A3C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addPhotoBtnText: {
    color: '#FF4C4C',
    fontSize: 12,
    fontWeight: '700',
  },
  startVoiceBtn: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micCircleInactive: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF4C4C',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#FF4C4C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startVoiceBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  recordingCardActive: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulsingMicWrapperActive: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
  },
  recordingCountdown: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },
  recordingAlertText: {
    color: '#FF4C4C',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  triageStatusBanner: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 32,
  },
  triageStatusBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  cancelTriageBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cancelTriageBtnText: {
    color: '#AEAEB2',
    fontSize: 13,
    fontWeight: '700',
  },
  
  // Step Screen Layout Rules
  glowingActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#30D158',
    marginRight: 8,
    shadowColor: '#30D158',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  stepProgressContainer: {
    width: '100%',
    marginTop: 20,
    marginBottom: 20,
  },
  stepCountText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '700',
  },
  stepPercentText: {
    color: '#30D158',
    fontSize: 13,
    fontWeight: '700',
  },
  stepProgressBg: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2C2C2E',
    overflow: 'hidden',
  },
  stepProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#30D158',
  },
  guidanceCard: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 24,
    marginVertical: 12,
    justifyContent: 'center',
  },
  guidanceText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 34,
  },
  micStatusContainer: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
  },
  ttsSpeakingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  speakingWaveWrapper: {
    marginRight: 8,
  },
  sttListeningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.2)',
  },
  pulsingMicWrapperActiveMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  micStatusMessage: {
    color: '#AEAEB2',
    fontSize: 12,
    fontWeight: '600',
  },
  micStatusMessageActive: {
    color: '#FF4C4C',
    fontSize: 12,
    fontWeight: '700',
  },
  actionControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginVertical: 16,
  },
  actionBtn: {
    width: 90,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  actionBtnDisabled: {
    opacity: 0.3,
  },
  actionBtnCenter: {
    width: 140,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 2,
  },
  actionBtnCenterInner: {
    flex: 1,
    borderRadius: 23,
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnCenterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  endAssistantBtn: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#FF3B30',
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  endAssistantBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
