import './src/bootstrap';
import { registerWidgetTasks } from './src/infrastructure/widgetTasks';
import { processReminderAction, reconcileNativeNotifications } from './src/infrastructure/reminderActions';
registerWidgetTasks(processReminderAction, reconcileNativeNotifications);
import 'expo-router/entry';
