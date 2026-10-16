import { effectiveEntries, selectActivities, type DomainState } from '../domain';
import type { AppLanguage } from '../i18n/core';

export interface WidgetActivity { id: string; name: string; emoji: string; isPrivate: boolean; last: string }
export interface WidgetProjection {
  schema: 1; databaseId: string; language: AppLanguage; activities: WidgetActivity[];
  copy: { record: string; configure: string; empty: string; pending: string; success: string; error: string; choose: string; visible: string; done: string; private: string; service: string };
}
const copy: Record<AppLanguage, WidgetProjection['copy']> = {
  es: { record:'Registrar',configure:'Elegir actividades',empty:'Abre Dailoop para elegir actividades.',pending:'Guardando…',success:'Registrado',error:'No se guardó. Abre Dailoop y reintenta.',choose:'Elige hasta 4 actividades',visible:'Las actividades elegidas, incluidas las privadas, serán visibles en la pantalla de inicio.',done:'Listo',private:'Privada',service:'Guardando tu actividad' },
  en: { record:'Record',configure:'Choose activities',empty:'Open Dailoop to choose activities.',pending:'Saving…',success:'Recorded',error:'Not saved. Open Dailoop and retry.',choose:'Choose up to 4 activities',visible:'Selected activities, including private ones, will be visible on your home screen.',done:'Done',private:'Private',service:'Saving your activity' },
  pt: { record:'Registrar',configure:'Escolher atividades',empty:'Abra o Dailoop para escolher atividades.',pending:'Salvando…',success:'Registrado',error:'Não foi salvo. Abra o Dailoop e tente novamente.',choose:'Escolha até 4 atividades',visible:'As atividades escolhidas, incluindo as privadas, ficarão visíveis na tela inicial.',done:'Pronto',private:'Privada',service:'Salvando sua atividade' },
};
const locale: Record<AppLanguage,string>={es:'es-CO',en:'en-US',pt:'pt-BR'};
/** A disposable, minimal presentation cache. No notes, credentials or audit rows. */
export function widgetProjection(state: DomainState, language: AppLanguage): WidgetProjection {
  const latest=new Map<string,number>();
  for(const entry of effectiveEntries(state)) latest.set(entry.activityId,Math.max(latest.get(entry.activityId)??-Infinity,entry.revision.occurredAtMs));
  const format=new Intl.DateTimeFormat(locale[language],{timeZone:state.settings.zone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:state.settings.hourFormat==='12h'});
  return {schema:1,databaseId:state.meta.databaseId,language,copy:copy[language],activities:selectActivities(state).map(activity=>({id:activity.id,name:activity.name,emoji:activity.emoji,isPrivate:activity.isPrivate,last:latest.has(activity.id)?format.format(latest.get(activity.id)!):({es:'Sin registros',en:'No records',pt:'Sem registros'}[language])}))};
}
