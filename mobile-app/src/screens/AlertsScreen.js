import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, MapPin, FileText, CheckCircle, Users, PhoneCall, Clock } from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../theme/theme';

export default function AlertsScreen() {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [loadingMap, setLoadingMap] = useState(true);

  const GEOAPIFY_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_KEY
    

  useEffect(() => {
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
      } catch (error) {
        setErrorMsg('Could not fetch location');
      } finally {
        setLoadingMap(false);
      }
    })();
  }, []);

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
            />
          </View>
          
          {loadingMap ? (
            <View style={[styles.mapGraphic, { justifyContent: 'center', alignItems: 'center' }]}>
                            <ActivityIndicator size="large" color={COLORS.primary} />
                            <Text style={{ marginTop: 10, color: COLORS.textSecondary }}>Locating...</Text>
                          </View>
                        ) : AlertsScreen.errorMsg ? (
                          <View style={[styles.mapGraphic, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8D7DA' }]}>
                            <Text style={{ color: '#721C24', textAlign: 'center', padding: 20 }}>{errorMsg}</Text>
                          </View>
                        ) : AlertsScreen.location ? (
                          <Image
                            source={{
                              uri: `https://maps.geoapify.com/v1/staticmap?style=osm-bright-smooth&width=600&height=400&center=lonlat:${location.coords.longitude},${location.coords.latitude}&marker=lonlat:${location.coords.longitude},${location.coords.latitude};color:%23ff0000;size:medium&apikey=${GEOAPIFY_KEY}`,
                            }}
                            style={styles.mapGraphic}
                            resizeMode="cover"
                          />
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
  mapGraphic: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  mapGrid: {
    flex: 1,
    borderWidth: 20,
    borderColor: 'transparent',
    borderTopColor: '#DCE4EC',
    borderLeftColor: '#DCE4EC',
    opacity: 0.5,
  },
  routeLine: {
    position: 'absolute',
    width: 60,
    height: 100,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderColor: COLORS.info,
    top: 100,
    left: 120,
    borderTopRightRadius: 20,
  },
  mapMarker: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.surface,
    ...SHADOWS.medium,
  },
  markerText: {
    color: COLORS.textLight,
    fontWeight: '800',
    fontSize: 16,
  },
  markerLabelWrapper: {
    position: 'absolute',
    top: 105,
    left: 90,
    backgroundColor: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  markerLabel: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: '700',
  },
  mapPlaceholderNote: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.7)',
    padding: 8,
    borderRadius: 8,
  },
  mapNoteText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
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
});
