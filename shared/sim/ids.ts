/**
 * KAC-06 — ids opacos.
 *
 * Os ids nasciam de um contador único da partida (1, 2, 3...). Quem via uma unidade inimiga nova podia subtrair os
 * próprios ids e saber quantas unidades e prédios o inimigo já tinha criado. Agora o contador continua existindo (é
 * ele que vai no salvamento), mas o id publicado passa por uma permutação secreta da partida: único, estável e sem
 * ordem aparente. A chave fica só no servidor (`server/kac/entityIds.ts`); sem chave (testes, ferramentas), o id é o
 * próprio contador.
 *
 * Nada na simulação pode depender da ordem dos ids. "Mais antigo primeiro" usa a ordem de inserção das entidades
 * (`Simulation.entities` é um Map, e o salvamento preserva essa ordem).
 */
export type IdSpace = 'entity' | 'air' | 'mine' | 'caravan';

/** Recebe o contador (1, 2, 3...) e devolve o id publicado. Precisa ser uma bijeção dentro de cada espaço. */
export type IdCipher = (space: IdSpace, counter: number) => number;
