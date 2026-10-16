import React from 'react';
import { act,fireEvent,render,screen } from '@testing-library/react-native';
import { applyPlanning,createEmptyState,execute,getPlanning,type DomainState,type PlanningCommand } from '../src/domain';
import { RemindersScreen,type RemindersScreenProps } from '../src/ui/reminders';
import { LanguageProvider } from '../src/i18n/react';
import type { AppLanguage } from '../src/i18n/core';

jest.mock('expo-crypto',()=>{let serial=0;return{randomUUID:()=>`70010000-0000-4000-9000-${String(++serial).padStart(12,'0')}`};});
jest.mock('react-native-gesture-handler',()=>{
  const pan={enabled:()=>pan,maxPointers:()=>pan,activeOffsetX:()=>pan,failOffsetY:()=>pan,onStart:()=>pan,onUpdate:()=>pan,onEnd:()=>pan,onFinalize:()=>pan,maxDistance:()=>pan};
  return{Gesture:{Pan:()=>pan,Tap:()=>pan,Exclusive:()=>pan},PointerType:{KEY:3},GestureDetector:({children}:{children:React.ReactNode})=>children};
});
const now=Date.parse('2026-10-16T15:00:00Z');
const id=(n:number)=>`70000000-0000-4000-9000-${String(n).padStart(12,'0')}`;
function fixture(){
  let state=execute(createEmptyState({databaseId:id(1),nowMs:now-60_000,zone:'America/Bogota'}),{type:'createActivity',id:id(2),name:'Leer',emoji:'📚',color:'#DCCFFF'},{operationId:id(3),nowMs:now-60_000,nextId:()=>id(4)}).state;
  state={...state,planning:applyPlanning(state,{type:'createReminder',id:id(5),activityId:id(2),completionEntryId:id(6),dueAtMs:now+60_000,leadMinutes:[0],notifications:true},{operationId:id(7),nowMs:now-60_000,nextId:()=>id(8)})};
  return state;
}
function props(state=fixture()){
  return{state,nowMs:now,notificationStatus:'granted',onEnableNotifications:jest.fn(async()=>undefined),onComplete:jest.fn<Promise<void>,[string,number?]>(async()=>undefined),onSave:jest.fn<Promise<void>,[PlanningCommand,string?]>(async()=>undefined)} satisfies RemindersScreenProps;
}
function page(value:RemindersScreenProps,language:AppLanguage='es'){return<LanguageProvider language={language} onLanguageChange={async()=>undefined}><RemindersScreen {...value}/></LanguageProvider>;}

test.each([10,30,60] as const)('snooze %s minutes saves only a stable occurrence planning command',async minutes=>{
  const p=props();await render(page(p));
  await fireEvent.press(screen.getByRole('button',{name:'Posponer recordatorio de Leer'}));
  expect(p.onSave).not.toHaveBeenCalled();expect(screen.getByText('Elige cuándo volver a recibir el aviso. Esto no registra la actividad.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button',{name:minutes===60?'1 hora':`${minutes} minutos`}));
  expect(p.onSave).toHaveBeenCalledWith({type:'snoozeReminderOccurrence',reminderId:id(5),dueAtMs:now+60_000,snoozedUntilMs:now+minutes*60_000},expect.any(String));
  expect(p.onComplete).not.toHaveBeenCalled();expect(p.state.entries).toHaveLength(0);
});
test('skip requires explicit confirmation, targets exactly one occurrence, and cancel writes nothing',async()=>{
  const p=props();await render(page(p));
  await fireEvent.press(screen.getByRole('button',{name:'Omitir esta ocasión de Leer'}));
  expect(p.onSave).not.toHaveBeenCalled();await fireEvent.press(screen.getByRole('button',{name:'Cancelar'}));expect(p.onSave).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button',{name:'Omitir esta ocasión de Leer'}));
  await fireEvent.press(screen.getByRole('button',{name:'Confirmar omisión'}));
  expect(p.onSave).toHaveBeenCalledWith({type:'skipReminderOccurrence',reminderId:id(5),dueAtMs:now+60_000},expect.any(String));expect(p.onComplete).not.toHaveBeenCalled();
});
test('one-off done passes its exact due time and remains distinct from planning actions',async()=>{
  const p=props();await render(page(p));await fireEvent.press(screen.getByRole('button',{name:'Completar recordatorio de Leer'}));
  expect(p.onComplete).toHaveBeenCalledWith(id(5),now+60_000);expect(p.onSave).not.toHaveBeenCalled();
});
test('failed snooze keeps dialog and reuses command/operation ID on retry',async()=>{
  const p=props();p.onSave.mockRejectedValueOnce(new Error('Disco ocupado'));
  await render(page(p));await fireEvent.press(screen.getByRole('button',{name:'Posponer recordatorio de Leer'}));
  await fireEvent.press(screen.getByRole('button',{name:'30 minutos'}));expect(screen.getByText('! Disco ocupado')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button',{name:'30 minutos'}));expect(p.onSave).toHaveBeenCalledTimes(2);expect(p.onSave.mock.calls[1]).toEqual(p.onSave.mock.calls[0]);
});
test('pending persistence disables actions and closes only after confirmation',async()=>{
  let finish!:()=>void;const p=props();p.onSave.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
  await render(page(p));await fireEvent.press(screen.getByRole('button',{name:'Posponer recordatorio de Leer'}));await fireEvent.press(screen.getByRole('button',{name:'10 minutos'}));
  expect(screen.getByRole('button',{name:'30 minutos'})).toBeDisabled();expect(screen.getByRole('button',{name:'Cancelar'})).toBeDisabled();
  await act(async()=>{finish();});expect(screen.queryByText('Elige cuándo volver a recibir el aviso. Esto no registra la actividad.')).toBeNull();
});
test('omitted view displays skipped occurrence without done/snooze controls or losing next repeats',async()=>{
  const original=fixture();const state:DomainState={...original,planning:applyPlanning(original,{type:'skipReminderOccurrence',reminderId:id(5),dueAtMs:now+60_000},{operationId:id(9),nowMs:now,nextId:()=>id(10)})};
  const p=props(state);await render(page(p));
  await fireEvent.press(screen.getByRole('checkbox',{name:'Recordatorios omitidos'}));
  expect(screen.getByText('Omitido · sin registrar la actividad')).toBeTruthy();expect(screen.queryByRole('button',{name:'Completar recordatorio de Leer'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Posponer recordatorio de Leer'})).toBeNull();expect(getPlanning(state).reminders).toHaveLength(1);expect(state.entries).toHaveLength(0);
});
test('postponed time is visible and read-only screens cannot perform actions',async()=>{
  const original=fixture();const state={...original,planning:applyPlanning(original,{type:'snoozeReminderOccurrence',reminderId:id(5),dueAtMs:now+60_000,snoozedUntilMs:now+600_000},{operationId:id(9),nowMs:now,nextId:()=>id(10)})};
  const p={...props(state),readOnly:true};await render(page(p));expect(screen.getByText(/^Pospuesto hasta /)).toBeTruthy();
  for(const name of ['Completar recordatorio de Leer','Posponer recordatorio de Leer','Omitir esta ocasión de Leer'])expect(screen.getByRole('button',{name})).toBeDisabled();
  expect(p.onSave).not.toHaveBeenCalled();expect(p.onComplete).not.toHaveBeenCalled();
});
test.each([{language:'en' as const,snooze:'Snooze reminder for Leer',choice:'30 minutes',skip:'Skipped reminders'},{language:'pt' as const,snooze:'Adiar lembrete de Leer',choice:'30 minutos',skip:'Lembretes pulados'}])('actions fully translate in $language without translating activity names',async row=>{
  const p=props();await render(page(p,row.language));expect(screen.getByText('Leer')).toBeTruthy();expect(screen.getByRole('checkbox',{name:row.skip})).toBeTruthy();
  await fireEvent.press(screen.getByRole('button',{name:row.snooze}));expect(screen.getByRole('button',{name:row.choice})).toBeTruthy();
});
