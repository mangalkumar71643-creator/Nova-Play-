import { Linking } from 'react-native';
import { startChatSession } from '../api/backend';
import { API_BASE_URL, ApiClientError } from '../api/client';
import { showAlert } from '../components/AppAlert';

/** Opens the live chat with the support team (backend public/chat.html) in the browser. */
export async function openLiveChat() {
  try {
    const { chatToken } = await startChatSession();
    await Linking.openURL(`${API_BASE_URL}/chat.html?token=${encodeURIComponent(chatToken)}`);
  } catch (err) {
    showAlert('Could not connect', err instanceof ApiClientError ? err.message : 'Please try again.');
  }
}
