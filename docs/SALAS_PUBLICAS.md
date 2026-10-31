# Salas públicas (menu)

Pedido do usuário (31/10): no menu, uma seção de salas públicas onde os jogadores entram ou criam salas.

## Como funciona

- **Menu → botão "Salas Públicas":** abre uma tela própria (`RoomsScreen`), como o navegador de salas do Rise of
  Nations ou do Among Us:
  - tabela com as salas multijogador em lobby e com vaga, as mais cheias primeiro (até 30);
  - colunas: sala (anfitrião e código), mapa, nações já escolhidas, vagas e "Entrar" (ou duplo clique na linha);
  - filtro por anfitrião, país ou código, e a opção "Com 2 ou mais vagas";
  - "⟳ Atualizar" pede a lista na hora; ela também se atualiza sozinha a cada 5 s;
  - "+ Criar sala pública" cria uma sala multijogador já aberta;
  - embaixo, "Entrar com código" para salas privadas.
- **"Criar Sala Privada":** continua no menu e gera um código para convidar outro comandante.
- **Lobby (anfitrião):**
  - **Nome da sala:** até 32 caracteres; o padrão é "Sala de <anfitrião>". Aparece no título do lobby e na lista.
  - **Vagas na sala:** de 2 a 4 na versão grátis, até 6 para assinante (monetização futura).
  - **Mapa:** o tipo do mapa, ou sorteado.
  - **Vagas:** cada vaga livre fica aberta para jogador ou é preenchida com "+ Bot (IA)"; o ✖ reabre a vaga.
  - **Iniciar Operação:** liberado com 2 ou mais nações e os jogadores prontos.
- **Lobby:** o anfitrião de uma sala multijogador marca ou desmarca "Sala pública" a qualquer momento. Sem marcar,
  a sala é privada e só entra quem tiver o código, como antes.
- **Quando a sala sai da lista:** quando a partida começa, quando lota, quando o anfitrião fica desconectado ou quando
  vira privada.
- **Modos:** só salas multijogador podem ser públicas; partidas contra a IA e o Sandbox, não.

## Protocolo

- **Cliente:** `{ t: 'list_rooms' }`; `create_room` aceita `isPublic`; `set_room` aceita `isPublic`.
- **Servidor:** `{ t: 'room_list', rooms: PublicRoomSummary[] }`; `RoomInfo.isPublic`.
- **Código:** `Room.publicSummary` e `RoomManager.listPublic`.
- **Testes:** `server/room.test.ts`, bloco "salas públicas".
