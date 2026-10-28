import { registerRootComponent } from 'expo';

import App from './App';
// Defines the background message check, which Android may start without the app's screens.
import './src/services/phoneNotifications';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
