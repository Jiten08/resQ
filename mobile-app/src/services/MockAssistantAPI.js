export const MockAssistantAPI = {
  processAudioStream: async () => {
    // Simulate network delay for processing audio
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          text: "I am analyzing the situation. Are there any visible injuries? Please take a photo of the victim so I can assess their condition.",
          requiresPhoto: true,
          escalate: false
        });
      }, 2000);
    });
  },

  analyzePhoto: async (imageUri) => {
    // Simulate network delay for analyzing a photo
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          text: "I've analyzed the photo. The victim appears to be unconscious. This is a critical situation. I am escalating to emergency services and locating the nearest hospital.",
          escalate: true
        });
      }, 3000);
    });
  },

  evaluateEscalation: async (userLocation) => {
    // Returns mock hospital and route data based on user location
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          hospital: {
            name: "St. Jude's Medical Center",
            address: "101 E Valencia Mesa Dr",
            latitude: userLocation?.latitude ? userLocation.latitude + 0.01 : 33.924,
            longitude: userLocation?.longitude ? userLocation.longitude + 0.01 : -117.917,
          },
          eta: "5 mins",
          status: "Ambulance Dispatched"
        });
      }, 1500);
    });
  }
};
