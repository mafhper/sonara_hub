// As portas deste projeto, em um lugar so.
//
// Sonara Hub e um PAR ACOPLADO: o cliente Vite fala com a API por proxy, e o
// script `dev:client` ESPERA a API ficar pronta antes de subir o Vite. Mover um
// lado sem o outro quebra o par — e antes desta fonte unica o numero aparecia
// em 21 pontos de 12 arquivos.
//
//   cliente (Vite)  5310
//   API (Express)   4310
//
// A convencao e a do proprio Vite: preview = dev - 1000 (`5173`/`4173`). Fora de
// 5173-5175 e 4173-4175 de proposito — sao as faixas onde o incremento automatico
// cai, e uma porta nomeada la dentro seria indistinguivel de um incremento.

export const CLIENT_PORT = 5310;
export const API_PORT = 4310;

/**
 * `server/server-port.mjs` mantem uma guarda: se `PORT` pedir a porta do
 * cliente, ela recua para a da API. Isso existe porque os dois numeros eram
 * vizinhos (5173 e 4175) e um `PORT=5173` colidia com o Vite. Com 5310 e 4310
 * a colisão nao existe mais, mas a guarda fica — e o teste
 * `tests/server-port.test.mjs` continua exigindo que ela exista.
 */
export const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
export const CLIENT_ORIGIN = `http://127.0.0.1:${CLIENT_PORT}`;
