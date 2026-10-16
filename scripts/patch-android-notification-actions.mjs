import {readFile,writeFile} from 'node:fs/promises';
const root = new URL('../',import.meta.url);
const pkg=JSON.parse(await readFile(new URL('node_modules/expo-notifications/package.json',root),'utf8'));
if(pkg.version!=='57.0.23')throw new Error('Review notification action patch for this SDK version.');
const file=new URL('node_modules/expo-notifications/android/src/main/java/expo/modules/notifications/service/delegates/ExpoHandlingDelegate.kt',root);
const source=await readFile(file,'utf8');
const anchor='  override fun handleNotificationResponse(notificationResponse: NotificationResponse) {';
const marker='// Dailoop v070 durable action bridge';
const block=`${anchor}
    ${marker}
    if (notificationResponse.actionIdentifier.startsWith("dailoop.v070.")) {
      val actionIntent = Intent()
        .setClassName(context.packageName, "local.dailoop.glass.DailoopWidgetActionReceiver")
        .putExtra("dailoopNotificationResponse", NotificationSerializer.toBundle(notificationResponse))
      context.sendBroadcast(actionIntent)
      return
    }`;
if(source.includes(marker)){if(!source.includes(block))throw new Error('Notification bridge drift.');}
else {if(source.split(anchor).length!==2 || !source.includes('import android.content.Intent') || !source.includes('import expo.modules.notifications.notifications.NotificationSerializer'))throw new Error('Unexpected notification delegate source.');await writeFile(file,source.replace(anchor,block));}
console.log('Android durable notification actions verified.');
