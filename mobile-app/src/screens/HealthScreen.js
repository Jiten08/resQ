import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, User, Activity, Phone } from 'lucide-react-native';
import { COLORS, SIZES, SHADOWS } from '../theme/theme';
import { useProfile } from '../context/ProfileContext';

export default function HealthScreen() {
  const { profile, updateProfile } = useProfile();
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  
  const [editForm, setEditForm] = useState(profile);
  
  const handleSave = () => {
    updateProfile(editForm);
    setEditModalVisible(false);
  };

  const openEditModal = () => {
    setEditForm(profile);
    setEditModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Profile</Text>
        </View>

        {/* Profile Details */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <User color={COLORS.primary} size={20} />
            <Text style={styles.cardTitle}>Personal Information</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Full Name</Text>
            <Text style={styles.detailValue}>{profile?.name || 'Not set'}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Activity color={COLORS.primary} size={20} />
            <Text style={styles.cardTitle}>Medical Profile</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Blood Type</Text>
            <Text style={styles.detailValue}>{profile?.bloodType || 'Not set'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Conditions</Text>
            <Text style={styles.detailValue}>{profile?.conditions || 'Not set'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Allergies</Text>
            <Text style={styles.detailValue}>{profile?.allergies || 'Not set'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Medications</Text>
            <Text style={styles.detailValue}>{profile?.medications || 'Not set'}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Phone color={COLORS.primary} size={20} />
            <Text style={styles.cardTitle}>Emergency Details</Text>
          </View>
          {profile?.emergencyContacts?.length > 0 ? (
            profile.emergencyContacts.map((contact, index) => (
              <View key={index} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{contact.name || 'Unnamed'}</Text>
                <Text style={styles.detailValue}>{contact.phone || 'No Number'}</Text>
              </View>
            ))
          ) : (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>No emergency contacts added</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.editBtn} onPress={openEditModal}>
          <Text style={styles.editBtnText}>Edit Profile</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={isEditModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.closeBtn}>
              <X color={COLORS.text} size={24} />
            </TouchableOpacity>
          </View>
          
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput 
                style={styles.input} 
                value={editForm.name}
                onChangeText={(t) => setEditForm({...editForm, name: t})}
                placeholder="Full Name"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Blood Type</Text>
              <TextInput 
                style={styles.input} 
                value={editForm.bloodType}
                onChangeText={(t) => setEditForm({...editForm, bloodType: t})}
                placeholder="e.g. O+"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Medical Conditions</Text>
              <TextInput 
                style={styles.input} 
                value={editForm.conditions}
                onChangeText={(t) => setEditForm({...editForm, conditions: t})}
                placeholder="e.g. Asthma, Diabetes"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Allergies</Text>
              <TextInput 
                style={styles.input} 
                value={editForm.allergies}
                onChangeText={(t) => setEditForm({...editForm, allergies: t})}
                placeholder="e.g. Penicillin, Peanuts"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Medications</Text>
              <TextInput 
                style={styles.input} 
                value={editForm.medications}
                onChangeText={(t) => setEditForm({...editForm, medications: t})}
                placeholder="e.g. 3 Active"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Emergency Contacts</Text>
              {Array.isArray(editForm.emergencyContacts) && editForm.emergencyContacts.map((contact, index) => (
                <View key={index} style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <TextInput 
                    style={[styles.input, { flex: 1, padding: 12, paddingVertical: 10 }]} 
                    value={contact.name}
                    onChangeText={(t) => {
                      const newContacts = [...editForm.emergencyContacts];
                      newContacts[index] = { ...newContacts[index], name: t };
                      setEditForm({...editForm, emergencyContacts: newContacts});
                    }}
                    placeholder="Name"
                  />
                  <TextInput 
                    style={[styles.input, { flex: 1, padding: 12, paddingVertical: 10 }]} 
                    value={contact.phone}
                    onChangeText={(t) => {
                      const newContacts = [...editForm.emergencyContacts];
                      newContacts[index] = { ...newContacts[index], phone: t };
                      setEditForm({...editForm, emergencyContacts: newContacts});
                    }}
                    placeholder="Phone"
                    keyboardType="phone-pad"
                  />
                  <TouchableOpacity 
                    style={{ justifyContent: 'center', padding: 8, backgroundColor: 'rgba(255, 59, 48, 0.1)', borderRadius: 12 }}
                    onPress={() => {
                      const newContacts = editForm.emergencyContacts.filter((_, i) => i !== index);
                      setEditForm({...editForm, emergencyContacts: newContacts});
                    }}
                  >
                    <X color="#FF3B30" size={20} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity 
                style={{ alignSelf: 'flex-start', marginTop: 4, paddingVertical: 8 }}
                onPress={() => {
                  const newContacts = Array.isArray(editForm.emergencyContacts) ? [...editForm.emergencyContacts] : [];
                  newContacts.push({ name: '', phone: '' });
                  setEditForm({...editForm, emergencyContacts: newContacts});
                }}
              >
                <Text style={{ color: COLORS.primary, fontWeight: '700' }}>+ Add Contact</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Profile</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

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
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    ...SHADOWS.light,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginLeft: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  editBtn: {
    backgroundColor: COLORS.text,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  editBtnText: {
    color: COLORS.textLight,
    fontWeight: '700',
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SIZES.padding,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  closeBtn: {
    padding: 4,
  },
  modalScroll: {
    padding: SIZES.padding,
    paddingBottom: 40,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.text,
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: {
    color: COLORS.textLight,
    fontWeight: '700',
    fontSize: 16,
  },
});
