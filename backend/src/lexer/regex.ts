export const regex = {
  identificador: /^[a-zA-Z][a-zA-Z0-9]*$/,
  numero: /^\d+$/,
  cadena: /^".*?"$/,
  operadorRelacional: /^(==|!=|<=|>=|<|>)$/,
  asignacion: /^<-$/,
};

export const palabrasReservadas = [
  'Algoritmo',
  'FinAlgoritmo',
  'Definir',
  'Como',
  'Si',
  'Entonces',
  'Sino',
  'FinSi',
  'Mientras',
  'Hacer',
  'FinMientras',
  'Para',
  'Hasta',
  'FinPara',
  'Escribir',
];
