import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image, ActivityIndicator, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, MapPin, FileText, CheckCircle, Users, PhoneCall, Clock, X, AlertTriangle } from 'lucide-react-native';
import MapView, { Marker } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { COLORS, SIZES, SHADOWS } from '../theme/theme';

export default function AlertsScreen() {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [hospitals, setHospitals] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searchedLocation, setSearchedLocation] = useState(null);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  
  // Peer coordination states
  const [deviceId] = useState(() => Math.random().toString(36).substring(7));
  const [peerFallAlert, setPeerFallAlert] = useState(null);
  const [peerRouteInfo, setPeerRouteInfo] = useState(null);

  const mapRef = useRef(null);
  const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

  // Dynamically resolve WebSocket URL from Expo dev host IP
  const manifest = Constants.expoConfig || {};
  const hostUri = manifest.hostUri;
  const hostIp = hostUri ? hostUri.split(':')[0] : 'localhost';
  const WS_URL = `ws://${hostIp}:3000`;

  const fetchNearbyHospitals = async (lat, lng) => {
    if (!GOOGLE_API_KEY) {
      console.warn("Google API Key is not set in environment variables!");
      return;
    }
    try {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&type=hospital&key=${GOOGLE_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK' && data.results) {
        const mapped = data.results.map(item => ({
          id: item.place_id,
          name: item.name,
          vicinity: item.vicinity,
          coordinate: {
            latitude: item.geometry.location.lat,
            longitude: item.geometry.location.lng,
          }
        }));
        setHospitals(mapped);
      } else {
        console.warn("Google Nearby Search API returned status:", data.status, data.error_message || '');
      }
    } catch (err) {
      console.warn("Error fetching hospitals:", err);
    }
  };

  const handleSearchChange = async (text) => {
    setSearchQuery(text);
    if (!text || text.length < 3) {
      setSuggestions([]);
      return;
    }
    if (!GOOGLE_API_KEY) {
      console.warn("Google API Key is not set in environment variables!");
      return;
    }
    try {
      const lat = searchedLocation?.latitude || location?.coords?.latitude;
      const lng = searchedLocation?.longitude || location?.coords?.longitude;
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&location=${lat},${lng}&radius=10000&key=${GOOGLE_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK' && data.predictions) {
        setSuggestions(data.predictions);
      } else {
        console.warn("Google Autocomplete API returned status:", data.status, data.error_message || '');
      }
    } catch (err) {
      console.warn("Autocomplete error:", err);
    }
  };

  const handleSelectSuggestion = async (suggestion) => {
    setSearchQuery(suggestion.description);
    setSuggestions([]);
    if (!GOOGLE_API_KEY) {
      console.warn("Google API Key is not set in environment variables!");
      return;
    }
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${suggestion.place_id}&fields=geometry&key=${GOOGLE_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK' && data.result?.geometry?.location) {
        const loc = {
          latitude: data.result.geometry.location.lat,
          longitude: data.result.geometry.location.lng,
        };
        setSearchedLocation(loc);
        setSelectedHospital(null);
        setRouteInfo(null);
        
        // Animate map to location
        mapRef.current?.animateToRegion({
          ...loc,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }, 1000);

        // Fetch new nearby hospitals from searched location
        fetchNearbyHospitals(loc.latitude, loc.longitude);
      } else {
        console.warn("Google Place Details API returned status:", data.status, data.error_message || '');
      }
    } catch (err) {
      console.warn("Details API error:", err);
    }
  };

  const handleSelectHospital = (hospital) => {
    setSelectedHospital(hospital);
    setRouteInfo(null);
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

  useEffect(() => {
    console.log("AlertsScreen Mounted. Google API Key detected:", GOOGLE_API_KEY ? "YES (ends with " + GOOGLE_API_KEY.slice(-5) + ")" : "NO (undefined)");
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        setLoadingMap(false);
        return;
      }

      try {
        let currentLocation = await Location.getCurrentPositionAsync({});
        setLocation(currentLocation);
        fetchNearbyHospitals(currentLocation.coords.latitude, currentLocation.coords.longitude);
      } catch (error) {
        setErrorMsg('Could not fetch location');
      } finally {
        setLoadingMap(false);
      }
    })();
  }, []);

  // Set up persistent WebSocket connection
  useEffect(() => {
    let ws;
    let reconnectTimer;

    const connectWS = () => {
      console.log(`Connecting to ResQ WebSocket Relay from Alerts at: ${WS_URL}`);
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('Connected to ResQ Local WebSocket Relay Server (Alerts Screen)');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.triggered && data.senderId !== deviceId) {
            setPeerFallAlert(data);
          } else if (data && !data.triggered) {
            setPeerFallAlert(null);
            setPeerRouteInfo(null);
          }
        } catch (e) {
          console.warn('Error parsing WS message:', e);
        }
      };

      ws.onclose = () => {
        console.log('ResQ WS Connection closed on Alerts, retrying in 3s...');
        reconnectTimer = setTimeout(connectWS, 3000);
      };

      ws.onerror = (error) => {
        console.warn('ResQ WS Error on Alerts:', error.message);
      };
    };

    connectWS();

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimer);
    };
  }, [deviceId]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Map */}
        <View style={styles.mapPlaceholder}>
          <View style={styles.searchBar}>
            <Search color={COLORS.textSecondary} size={20} />
            <TextInput
              placeholder="Incident Location"
              placeholderTextColor={COLORS.textSecondary}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={handleSearchChange}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setSuggestions([]);
                  setSearchedLocation(null);
                  setSelectedHospital(null);
                  setRouteInfo(null);
                }}
                style={styles.clearSearchInput}
              >
                <X color={COLORS.textSecondary} size={18} />
              </TouchableOpacity>
            )}
          </View>

          {/* Autocomplete Dropdown List */}
          {suggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                {suggestions.map((item) => (
                  <TouchableOpacity
                    key={item.place_id}
                    style={styles.suggestionItem}
                    onPress={() => handleSelectSuggestion(item)}
                  >
                    <MapPin size={16} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
                    <Text style={styles.suggestionText} numberOfLines={1}>
                      {item.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          
          {loadingMap ? (
            <View style={[styles.mapGraphic, { justifyContent: 'center', alignItems: 'center' }]}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{ marginTop: 10, color: COLORS.textSecondary }}>Locating...</Text>
            </View>
          ) : errorMsg ? (
            <View style={[styles.mapGraphic, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8D7DA' }]}>
              <Text style={{ color: '#721C24', textAlign: 'center', padding: 20 }}>{errorMsg}</Text>
            </View>
          ) : location ? (
            <View style={styles.mapGraphic}>
              <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFillObject}
                initialRegion={{
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }}
              >
                {/* User Current Location Marker */}
                <Marker
                  coordinate={{
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                  }}
                  title="Your Location"
                  description="You are here"
                  pinColor="blue"
                />

                {/* Searched Location Marker */}
                {searchedLocation && (
                  <Marker
                    coordinate={searchedLocation}
                    title="Incident Location"
                    description="Searched position"
                    pinColor="red"
                  />
                )}

                {/* Nearby Hospitals Markers */}
                {hospitals.map((hospital) => (
                  <Marker
                    key={hospital.id}
                    coordinate={hospital.coordinate}
                    title={hospital.name}
                    description={hospital.vicinity}
                    onPress={() => handleSelectHospital(hospital)}
                  >
                    <View style={styles.hospitalMarker}>
                      <Text style={styles.hospitalMarkerText}>🏥</Text>
                    </View>
                  </Marker>
                ))}

                {/* Map Directions */}
                {selectedHospital && GOOGLE_API_KEY && (
                  <MapViewDirections
                    origin={{
                      latitude: location.coords.latitude,
                      longitude: location.coords.longitude,
                    }}
                    destination={selectedHospital.coordinate}
                    apikey={GOOGLE_API_KEY}
                    strokeWidth={4}
                    strokeColor={COLORS.primary}
                    optimizeWaypoints={true}
                    onReady={(result) => {
                      setRouteInfo({
                        distance: result.distance.toFixed(1),
                        duration: Math.ceil(result.duration),
                      });
                      
                      // Auto-fit route
                      mapRef.current?.fitToCoordinates(result.coordinates, {
                        edgePadding: {
                          right: 50,
                          bottom: 50,
                          left: 50,
                          top: 100,
                        },
                      });
                    }}
                    onError={(err) => console.warn(err)}
                  />
                )}
              </MapView>

              {/* Floating Route Card */}
              {selectedHospital && routeInfo && (
                <View style={styles.routeCard}>
                  <View style={styles.routeCardHeader}>
                    <Text style={styles.routeCardTitle} numberOfLines={1}>
                      {selectedHospital.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedHospital(null);
                        setRouteInfo(null);
                      }}
                      style={styles.routeCardClose}
                    >
                      <Text style={styles.routeCardCloseText}>×</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.routeCardBody}>
                    <View style={styles.routeCardItem}>
                      <Clock size={16} color={COLORS.primary} style={{ marginRight: 4 }} />
                      <Text style={styles.routeCardValue}>{routeInfo.duration} min</Text>
                    </View>
                    <View style={styles.routeCardItem}>
                      <MapPin size={16} color={COLORS.info} style={{ marginRight: 4 }} />
                      <Text style={styles.routeCardValue}>{routeInfo.distance} km</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </View>

        {/* Live Data Stream */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Live Data Stream</Text>
          <TouchableOpacity>
            <Text style={styles.seeAllText}>View all →</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.liveDataScroll} contentContainerStyle={{ gap: 12 }}>
          <View style={styles.dataCard}>
            <View style={[styles.dataIconWrapper, { backgroundColor: 'rgba(255, 76, 76, 0.1)' }]}>
              <FileText color={COLORS.primary} size={20} />
            </View>
            <Text style={styles.dataCardTitle}>Medical{'\n'}History</Text>
            <Text style={styles.dataCardSubtitle}>Allergic: Penicillin</Text>
          </View>
          
          <View style={styles.dataCard}>
            <View style={[styles.dataIconWrapper, { backgroundColor: 'rgba(52, 199, 89, 0.1)' }]}>
              <CheckCircle color={COLORS.success} size={20} />
            </View>
            <Text style={styles.dataCardTitle}>Contact 1{'\n'}Notified</Text>
            <Text style={styles.dataCardSubtitle}>Response in 1 min</Text>
          </View>
          
          <View style={styles.dataCard}>
            <View style={[styles.dataIconWrapper, { backgroundColor: 'rgba(0, 122, 255, 0.1)' }]}>
              <Users color={COLORS.info} size={20} />
            </View>
            <Text style={styles.dataCardTitle}>Staff{'\n'}Nearby</Text>
            <Text style={styles.dataCardSubtitle}>Acknowledged</Text>
          </View>
        </ScrollView>

        {/* Escalation Status */}
        <Text style={[styles.sectionTitle, { marginBottom: 16 }]}>Escalation Status</Text>
        
        <View style={styles.escalationCard}>
          <View style={styles.escalationIconWrapper}>
            <PhoneCall color={COLORS.textLight} size={24} />
          </View>
          <View style={styles.escalationTextWrapper}>
            <Text style={styles.escalationTitle}>Ambulance In Transit</Text>
            <Text style={styles.escalationSubtitle}>St. Jude's Hospital notified</Text>
          </View>
          <View style={styles.etaBadge}>
            <Text style={styles.etaText}>ETA 5m</Text>
          </View>
        </View>
        
        <View style={styles.statusUpdateCard}>
          <View style={styles.statusIconWrapper}>
            <Clock color={COLORS.warning} size={16} />
          </View>
          <View style={styles.statusTextWrapper}>
            <Text style={styles.statusTitle}>Status Update</Text>
            <Text style={styles.statusSubtitle}>Ambulance dispatched. Pre-admission form sent to St. Jude's Hospital.</Text>
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
  mapPlaceholder: {
    height: 300,
    backgroundColor: '#E8EDF2',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 24,
    padding: 16,
    position: 'relative',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 48,
    ...SHADOWS.light,
    zIndex: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: COLORS.text,
  },
  clearSearchInput: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 68,
    left: 16,
    right: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    ...SHADOWS.medium,
    zIndex: 100,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  suggestionText: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
  mapGraphic: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hospitalMarker: {
    backgroundColor: '#FFFFFF',
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FF4C4C',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hospitalMarkerText: {
    fontSize: 14,
  },
  routeCard: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    ...SHADOWS.medium,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  routeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  routeCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  routeCardClose: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeCardCloseText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  routeCardBody: {
    flexDirection: 'row',
    gap: 16,
  },
  routeCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeCardValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  liveDataScroll: {
    marginBottom: 32,
  },
  dataCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 16,
    width: 120,
    ...SHADOWS.light,
  },
  dataIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  dataCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
    lineHeight: 18,
  },
  dataCardSubtitle: {
    fontSize: 10,
    color: COLORS.textSecondary,
    lineHeight: 14,
  },
  escalationCard: {
    backgroundColor: 'rgba(255, 76, 76, 0.1)',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 76, 76, 0.2)',
  },
  escalationIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  escalationTextWrapper: {
    flex: 1,
  },
  escalationTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  escalationSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  etaBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  etaText: {
    color: COLORS.textLight,
    fontWeight: '800',
    fontSize: 12,
  },
  statusUpdateCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
  },
  statusIconWrapper: {
    marginRight: 12,
    marginTop: 2,
  },
  statusTextWrapper: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  peerFallOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1C1C1E',
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  peerFallHeader: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
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
    marginTop: 6,
    textAlign: 'center',
  },
  peerFallMapContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#2C2C2E',
    marginBottom: 20,
    position: 'relative',
  },
  peerRouteCard: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-around',
    elevation: 5,
  },
  peerRouteItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  peerRouteValue: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  peerAcceptBtn: {
    backgroundColor: '#FF3B30',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  peerAcceptBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  peerDismissBtn: {
    backgroundColor: '#2C2C2E',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  peerDismissBtnText: {
    color: '#AEAEB2',
    fontSize: 14,
    fontWeight: '700',
  },
});
