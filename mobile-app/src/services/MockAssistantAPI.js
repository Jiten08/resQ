import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Dynamically resolve developer machine's host IP for local network API access
const manifest = Constants.expoConfig || {};
const hostUri = manifest.hostUri;
const hostIp = hostUri ? hostUri.split(':')[0] : 'localhost';
const API_URL = `http://${hostIp}:8000`;

console.log(`[AssistantAPI] Connecting to FastAPI backend at: ${API_URL}`);

export const MockAssistantAPI = {
  /**
   * Sends phone recorded emergency audio and/or victim photo to the FastAPI backend.
   * @param {string|null} audioUri - Local phone URI for the recorded wav file.
   * @param {string|null} imageUri - Local phone URI for the captured photo.
   * @param {string} languageCode - Target speech/translation language.
   * @returns {Promise<{steps: string[], detected_text: string, language_code: string}>}
   */
  processEmergency: async (audioUri = null, imageUri = null, languageCode = 'en-IN', username = 'User') => {
    const formData = new FormData();
    formData.append('language', languageCode);
    formData.append('username', username);

    if (audioUri) {
      const audioName = audioUri.split('/').pop() || 'recording.wav';
      formData.append('audio', {
        uri: Platform.OS === 'android' ? audioUri : audioUri.replace('file://', ''),
        type: 'audio/wav',
        name: audioName,
      });
    }

    if (imageUri) {
      const imageName = imageUri.split('/').pop() || 'photo.jpg';
      formData.append('image', {
        uri: Platform.OS === 'android' ? imageUri : imageUri.replace('file://', ''),
        type: 'image/jpeg',
        name: imageName,
      });
    }

    try {
      const response = await fetch(`${API_URL}/api/process`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP Error status ${response.status}`);
      }

      return await response.json();
    } catch (e) {
      console.error("[AssistantAPI] processEmergency failed:", e);
      throw e;
    }
  },

  /**
   * Retrieves Sarvam Text-To-Speech base64 audio representation for a step string.
   * @param {string} text - First-aid instruction step.
   * @param {string} languageCode - Target speak language.
   * @returns {Promise<{audio_content: string}>}
   */
  getTTS: async (text, languageCode = 'en-IN') => {
    try {
      const response = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          text,
          language_code: languageCode,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP Error status ${response.status}`);
      }

      return await response.json();
    } catch (e) {
      console.error("[AssistantAPI] getTTS failed:", e);
      throw e;
    }
  },

  /**
   * Uploads a 2-second audio snippet to check for 'next' or 'previous' wake word commands.
   * @param {string} audioUri - Local phone URI for the captured command audio.
   * @returns {Promise<{command: string, transcript: string}>}
   */
  checkCommand: async (audioUri) => {
    const formData = new FormData();
    const audioName = audioUri.split('/').pop() || 'command.wav';

    formData.append('audio', {
      uri: Platform.OS === 'android' ? audioUri : audioUri.replace('file://', ''),
      type: 'audio/wav',
      name: audioName,
    });

    try {
      const response = await fetch(`${API_URL}/api/check_command`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP Error status ${response.status}`);
      }

      return await response.json();
    } catch (e) {
      console.error("[AssistantAPI] checkCommand failed:", e);
      throw e;
    }
  },

  /**
   * Triggers an emergency SMS and optionally logs ambulance call.
   */
  callAmbulance: async (username = 'User') => {
    try {
      const response = await fetch(`${API_URL}/api/call-ambulance?username=${encodeURIComponent(username)}`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
      });
      if (!response.ok) throw new Error(`HTTP Error status ${response.status}`);
      return await response.json();
    } catch (e) {
      console.error("[AssistantAPI] callAmbulance failed:", e);
      throw e;
    }
  }
};
