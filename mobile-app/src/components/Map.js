import { StyleSheet, Text, View, ActivityIndicator, Platform } from 'react-native'
import React, { useState, useEffect } from 'react'
import MapView, { PROVIDER_DEFAULT, Marker } from 'react-native-maps'
import * as Location from 'expo-location'

const Map = () => {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          return;
        }

        // Try getting last known position first (faster, avoids hanging on some simulators)
        let currentLocation = await Location.getLastKnownPositionAsync({});
        if (!currentLocation) {
          // If not available, get current position
          currentLocation = await Location.getCurrentPositionAsync({});
        }
        
        setLocation({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          latitudeDelta: 0.0122,
          longitudeDelta: 0.0121,
        });
      } catch (error) {
        setErrorMsg('Could not fetch location: ' + error.message);
      }
    })();
  }, []);

  if (errorMsg) {
    return (
      <View style={styles.center}>
        <Text style={{ color: 'red', textAlign: 'center', padding: 16 }}>{errorMsg}</Text>
      </View>
    );
  }

  if (!location) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={{ marginTop: 10 }}>Finding your location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={location}
        showsUserLocation={true}
        showsMyLocationButton={true}
      >
        <Marker coordinate={location} title="You are here" />
      </MapView>
    </View>
  )
}

export default Map

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    backgroundColor: '#E8EDF2',
  }
})