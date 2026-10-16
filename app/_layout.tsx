import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fontAssets } from '../src/ui/typography';
import { palette } from '../src/ui/tokens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FeedbackProvider } from '../src/ui/FeedbackProvider';
export default function Layout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  if (!fontsLoaded && !fontError) return <View style={{flex:1,alignItems:'center',justifyContent:'center',gap:16,backgroundColor:palette.base}}><ActivityIndicator color={palette.violet}/><Text style={{color:palette.ink}}>Dailoop</Text></View>;
  // A missing font must never prevent access to local data; platforms retain their fallback face.
  return <GestureHandlerRootView style={{flex:1}}><FeedbackProvider><SafeAreaProvider><Stack screenOptions={{headerShown:false}} /></SafeAreaProvider></FeedbackProvider></GestureHandlerRootView>;
}
