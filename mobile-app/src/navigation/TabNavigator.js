import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Bell, Heart, User } from 'lucide-react-native';
import HomeScreen from '../screens/HomeScreen';
import AlertsScreen from '../screens/AlertsScreen';
import HealthScreen from '../screens/HealthScreen';
import { COLORS } from '../theme/theme';


const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: 80,
          paddingBottom: 20,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Home color={color} size={24} />
          ),
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Bell color={color} size={24} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={HealthScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <User color={color} size={24} />
      
          ),
        }}
      />
      {/* <Tab.Screen
        name="Map"
        component={Map}
        options={{
          tabBarIcon: ({ color, size }) => (
            <User color={color} size={24} />
          ),
        }} /> */}
    </Tab.Navigator>
  );
}
