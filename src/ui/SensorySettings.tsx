import React, { useState } from 'react';
import { View } from 'react-native';
import { useI18n } from '../i18n/react';
import { sensoryPreferences, type PresentationPreferences, type SensoryPreferences } from '../infrastructure/preferences';
import { Label, Panel, Toggle, s } from './components';

export function SensorySettings({ preferences, onChange, disabled = false }: {
  preferences: PresentationPreferences;
  onChange(changes: Partial<SensoryPreferences>): Promise<void>;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const values = sensoryPreferences(preferences);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const update = async (changes: Partial<SensoryPreferences>) => {
    if (busy || disabled) return; setBusy(true); setError(false);
    try { await onChange(changes); } catch { setError(true); } finally { setBusy(false); }
  };
  return <Panel><Label strong>{t('Sonido y vibración')}</Label><Label small>{t('Ajusta las sensaciones sin cambiar tus registros.')}</Label>
    <View style={s.stack}>
      <Toggle label={t('Vibración háptica')} value={values.haptics} disabled={disabled || busy} onChange={haptics => { void update({ haptics }); }} />
      <Toggle label={t('Sonidos de la interfaz')} value={values.sounds} disabled={disabled || busy} onChange={sounds => { void update({ sounds }); }} />
      <Toggle label={t('Sonidos al navegar')} value={values.navigationSounds} disabled={disabled || busy || !values.sounds} onChange={navigationSounds => { void update({ navigationSounds }); }} />
      <Toggle label={t('Sonidos de confirmación')} value={values.confirmationSounds} disabled={disabled || busy || !values.sounds} onChange={confirmationSounds => { void update({ confirmationSounds }); }} />
      <Toggle label={t('Sonido de los avisos')} detail={t('Android también permite silenciar los avisos en sus ajustes.')} value={values.notificationSounds} disabled={disabled || busy} onChange={notificationSounds => { void update({ notificationSounds }); }} />
    </View>
    {error && <Label small strong>{t('No se pudo guardar esta preferencia. Inténtalo de nuevo.')}</Label>}
  </Panel>;
}
