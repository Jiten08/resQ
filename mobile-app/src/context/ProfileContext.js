import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ProfileContext = createContext();

export const ProfileProvider = ({ children }) => {
  const [profile, setProfile] = useState({
    name: 'Jiten',
    bloodType: 'O+',
    conditions: 'Asthma',
    allergies: 'Penicillin',
    medications: '3 Active',
    emergencyContacts: [
      { name: 'Mom', phone: '555-0100' },
      { name: 'Dad', phone: '555-0101' }
    ]
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const storedProfile = await AsyncStorage.getItem('@resq_profile');
        if (storedProfile) {
          const parsed = JSON.parse(storedProfile);
          // Migrate old numeric emergencyContacts to array
          if (typeof parsed.emergencyContacts === 'number') {
            parsed.emergencyContacts = [];
          }
          setProfile(parsed);
        }
      } catch (e) {
        console.error('Failed to load profile', e);
      }
    };
    loadProfile();
  }, []);

  const updateProfile = async (newProfile) => {
    try {
      const updatedProfile = { ...profile, ...newProfile };
      setProfile(updatedProfile);
      await AsyncStorage.setItem('@resq_profile', JSON.stringify(updatedProfile));
    } catch (e) {
      console.error('Failed to save profile', e);
    }
  };

  return (
    <ProfileContext.Provider value={{ profile, updateProfile }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => useContext(ProfileContext);
