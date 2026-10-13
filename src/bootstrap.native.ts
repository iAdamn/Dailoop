// Packaged Intl support: no runtime downloads or dependence on the developer machine's zone.
import '@formatjs/intl-getcanonicallocales/polyfill.js';
import '@formatjs/intl-locale/polyfill.js';
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/es.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-numberformat/polyfill.js';
import '@formatjs/intl-numberformat/locale-data/es.js';
import '@formatjs/intl-numberformat/locale-data/en.js';
import '@formatjs/intl-datetimeformat/polyfill.js';
import '@formatjs/intl-datetimeformat/locale-data/es.js';
import '@formatjs/intl-datetimeformat/locale-data/en.js';
import '@formatjs/intl-datetimeformat/add-all-tz.js';
import '@formatjs/intl-segmenter/polyfill.js';
import { getCalendars } from 'expo-localization';

// FormatJS defaults to UTC when it replaces the native formatter. Read Android's
// calendar directly so polyfilled default formatting keeps the device's zone.
const deviceZone=getCalendars()[0]?.timeZone;
const formatter=Intl.DateTimeFormat as typeof Intl.DateTimeFormat & {__setDefaultTimeZone?:(zone:string)=>void};
if(deviceZone&&formatter.__setDefaultTimeZone)formatter.__setDefaultTimeZone(deviceZone);
