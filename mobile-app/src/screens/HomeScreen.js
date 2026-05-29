import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, PanResponder, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Clock, Activity, Check, User, ChevronRight, AlertTriangle, Mic, Camera, MapPin } from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../theme/theme';
import { Accelerometer } from 'expo-sensors';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
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
  const [assistantMessage, setAssistantMessage] = useState("Voice assistant is activating...");
  const [requiresPhoto, setRequiresPhoto] = useState(false);
  const [escalationData, setEscalationData] = useState(null);
  const isAccidentTriggeredRef = useRef(isAccidentTriggered);
  
  useEffect(() => {
    isAccidentTriggeredRef.current = isAccidentTriggered;
  }, [isAccidentTriggered]);
  
  const KNOB_WIDTH = 44;
  
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

  useEffect(() => {
    let timer;
    if (isAccidentTriggered && countdown > 0 && !isCancelled) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (isAccidentTriggered && countdown === 0 && !isCancelled) {
      setIsAccidentTriggered(false);
      setIsAssistantActive(true);
      startAssistantFlow();
    }
    return () => clearInterval(timer);
  }, [isAccidentTriggered, countdown, isCancelled]);

  const startAssistantFlow = async () => {
    setAssistantMessage("Connecting to AI Emergency Responder...");
    try {
      await Audio.requestPermissionsAsync();
      const response = await MockAssistantAPI.processAudioStream();
      setAssistantMessage(response.text);
      if (response.requiresPhoto) {
        setRequiresPhoto(true);
      }
    } catch (e) {
      setAssistantMessage("Failed to connect to audio service.");
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
      setAssistantMessage("Analyzing photo...");
      setRequiresPhoto(false);
      const analysis = await MockAssistantAPI.analyzePhoto(result.assets[0].uri);
      setAssistantMessage(analysis.text);
      
      if (analysis.escalate) {
        let location = { coords: { latitude: 33.924, longitude: -117.917 } };
        try {
          location = await Location.getCurrentPositionAsync({});
        } catch(e) { }
        const escalation = await MockAssistantAPI.evaluateEscalation(location.coords);
        setEscalationData(escalation);
      }
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
            onPress={() => setAlertSent(false)}
          >
            <Text style={[styles.miniSosText, { fontSize: 16 }]}>I'm Safe Now</Text>
          </TouchableOpacity>
        </View>
      )}

      {isAssistantActive && !escalationData && (
        <View style={[styles.accidentOverlay, { backgroundColor: '#1C1C1E', bottom: 0, borderRadius: 0 }]} pointerEvents="box-none">
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, width: '100%' }}>
            <Activity color={COLORS.primary} size={64} style={{ marginBottom: 24 }} />
            <Text style={styles.accidentTitle}>AI RESPONDER</Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 20, borderRadius: 16, width: '100%', marginBottom: 32 }}>
              <Text style={{ color: COLORS.textLight, fontSize: 18, textAlign: 'center', lineHeight: 28 }}>
                {assistantMessage}
              </Text>
            </View>
            
            {requiresPhoto && (
              <TouchableOpacity style={styles.cameraBtn} onPress={handleTakePhoto}>
                <Camera color={COLORS.textLight} size={24} style={{ marginRight: 8 }} />
                <Text style={styles.cameraBtnText}>Take Photo of Victim</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={[styles.miniSosBtn, { backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 40, paddingHorizontal: 24, paddingVertical: 12 }]} 
              onPress={() => setIsAssistantActive(false)}
            >
              <Text style={[styles.miniSosText, { fontSize: 16 }]}>End Assistant</Text>
            </TouchableOpacity>
          </View>
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
});
