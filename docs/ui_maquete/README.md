# Maquete da interface — "Sala de Situação" (05/11/2026)

Proposta de identidade visual para o HUD, feita a pedido do responsável ("a UI está simples, dá ar de amadorismo").
**Ainda não está no jogo:** são imagens para aprovar a direção antes de mexer em `src/ui/`.

- `1-tela-computador.jpg` — partida com o Centro de Comando selecionado e a dica de um cartão.
- `2-tela-celular.jpg` — a mesma tela no celular em paisagem (menos itens, mesmo layout).
- `3-momento-cinematografico.jpg` — faixa dos grandes momentos (satélite, nova era, guerra, nuclear).
- `4-identidade-visual.jpg` — cores, tipografia, moldura, botões, estados dos cartões, ícones e regras de UX.
- `5-antes-e-depois.jpg` — prints do celular do usuário × a proposta, na mesma escala.

Ideia central: painéis de console sobre o mapa, com canto chanfrado (eco das formas facetadas do low poly), colchetes
de latão nos outros cantos, faixa na cor da nação, números em fonte de instrumento; ícones de um conjunto só (Lucide,
ISC) no lugar dos emojis; fontes livres (Barlow Condensed / Barlow Semi Condensed / JetBrains Mono, OFL) embutidas.

O fundo é uma cena real do jogo (Sandbox) capturada sem o HUD. Para refazer as imagens:

```bash
cd docs/ui_maquete/fonte
npm i --no-save @fontsource/barlow-semi-condensed @fontsource/barlow-condensed @fontsource/jetbrains-mono lucide-static
node build.cjs            # monta hud.html, hud-cine.html e folha.html (ícones embutidos)
node shot.cjs hud.html ../1-tela-computador.png 1600 900 2
```
