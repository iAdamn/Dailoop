import type { Color } from '../domain';

export const activityColors = [
  { color: '#F3E6A2', name: 'Amarillo' }, { color: '#AFD3F6', name: 'Azul' }, { color: '#F4B2B8', name: 'Rojo' },
  { color: '#F6C9A2', name: 'Naranja' }, { color: '#B8DFBA', name: 'Verde' }, { color: '#D3BEF4', name: 'Violeta suave' },
  { color: '#F6D7A1', name: 'Amarillo naranja' }, { color: '#DCE9AA', name: 'Amarillo verde' }, { color: '#A9DFD2', name: 'Azul verde' },
  { color: '#BCC6F5', name: 'Azul violeta' }, { color: '#E7B7DB', name: 'Rojo violeta' }, { color: '#F4BBA8', name: 'Rojo naranja' },
  { color: '#6F5BFF', name: 'Violeta' }, { color: '#9A7CFF', name: 'Lila' }, { color: '#DCCFFF', name: 'Lavanda' },
  { color: '#8FD8FF', name: 'Celeste' }, { color: '#F7F7FC', name: 'Claro' }, { color: '#23263A', name: 'Oscuro' },
] as const satisfies readonly { color: Color; name: string }[];
