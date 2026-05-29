import React from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Search } from 'lucide-react-native';
import { COLORS, SHADOWS } from '../theme/theme';
import Map from './Map';
export default function MapComponent() {
  return (
    <View style={styles.mapPlaceholder}>
      <View style={styles.searchBar}>
        <Search color={COLORS.textSecondary} size={20} />
        <TextInput
          placeholder="Incident Location"
          placeholderTextColor={COLORS.textSecondary}
          style={styles.searchInput}
        />
      </View>
      
      <View style={styles.mapGraphic}>
        <Map />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    zIndex: 1, // Keep behind search bar
  },
});
