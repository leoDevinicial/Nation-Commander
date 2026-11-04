# Idiomas: português, inglês e espanhol (04/11)

Pedido do usuário: identificar a região do jogador pelo IP e trocar o idioma, com versões em espanhol e inglês além do
português, e uma opção no menu para mudar.

## Como escolhe o idioma

1. **Escolha do jogador** (menu principal, canto de baixo, 🌐; e Configurações → Idioma): fica salva e manda sempre.
2. **Região pelo IP** (primeira visita): `api/geo.js` é uma função da Vercel que devolve o país que a própria Vercel
   detecta (`x-vercel-ip-country`). Nada vai para serviços de terceiros e o IP não é guardado nem devolvido.
   Brasil, Portugal e países lusófonos → português; países hispânicos → espanhol; o resto → inglês.
3. **Sem região** (desenvolvimento local, rede bloqueada): o idioma do navegador (`navigator.languages`); sem pt/es/en,
   inglês. Enquanto `/api/geo` não responde (até 1,5 s) vale o último idioma detectado.

Salvo em `localStorage` (`nc.lang.v1`: `chosen` e `detected`). `src/i18n/index.ts` (`initI18n`, `useLangStore`).

## Como traduz

O jogo continua escrito em português no código. `src/i18n/en.ts` e `es.ts` são dicionários **texto em português →
tradução** (cerca de 3 mil entradas cada, carregados só para quem usa o idioma). `src/i18n/dom.ts` observa a página
(`MutationObserver`) e troca textos e os atributos `title`, `placeholder`, `aria-label` e `alt`, guardando o original
para voltar ao português ou trocar de idioma na hora. Mensagens que vêm do servidor (recusas de ordens, eventos, nomes
de prédios e tropas) passam pela mesma tradução, porque chegam à tela como texto.

`src/i18n/translate.ts` casa um texto de três formas:
- **exato**;
- **molde com lacunas**: a chave `Nível {0}: especialização` casa "Nível 3: especialização"; o que caiu em cada lacuna
  também é traduzido ("Pesquisa: Fazenda" → "Research: Farm"). Molde curto que começa por lacuna ("{0} de {1}") só
  aceita números nas lacunas, para não pegar frases inteiras;
- **partes**: listas com " · " e "número + nome" ("300 comida" → "300 food").

Sem tradução, o texto fica em português (nunca some). Não são traduzidos: o chat e os nomes dos jogadores
(`translate="no"`), o seletor de idioma e nomes próprios (cidades). Textos desenhados no 3D/canvas usam `t()` direto
(ex.: o painel do drone em primeira pessoa).

## Ao criar um texto novo

Escreva em português como sempre e acrescente a tradução nos dois dicionários (chave = texto em português; lacunas
`{0}`, `{1}`… na ordem do template). Para listar o que ficou sem tradução:

```bash
npx tsx scripts/i18n-faltando.ts
```

A lista inclui palavras iguais nos três idiomas (Hospital, Argentina, nomes de teclas); essas não precisam de entrada.

## O que não mudou

O manual em PDF (`docs/GUIA_DO_JOGADOR.pdf`) e a documentação seguem em português. Números usam vírgula decimal nos
três idiomas.
