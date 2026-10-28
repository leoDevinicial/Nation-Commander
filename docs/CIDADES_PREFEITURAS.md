# Cidades e prefeituras

Inspirado em Rise of Nations: o território cresce fundando cidades, e uma cidade inimiga pode ser
tomada.

## Prefeitura
| | |
|---|---|
| Custo | 200 madeira, 120 pedra, 150 suprimentos · 35 s de obra |
| Tamanho | 2×2 · vida 1200 · visão 11 · atalho **G** (com o QG selecionado) |
| Fronteira | raio 10, com peso 1,4 na disputa de fronteira (mais que torres e casas, menos que o QG) |
| Benefícios | abriga 10 · guarda 200 suprimentos e 100 de comida, madeira e pedra · rende 1 suprimento/s |

- **Nome real:** ao começar a obra, a prefeitura recebe o nome de uma cidade real do país de quem a
  fundou, das maiores para as menores, sem repetir nomes na partida. Por exemplo:
  - Brasil: São Paulo, Rio de Janeiro, Salvador…;
  - França: Marselha, Lyon, Toulouse…
- **Lista esgotada:** os nomes seguem como "Nova São Paulo", "Nova Rio de Janeiro" e assim por diante.
- **Capital:** o QG é a capital (Brasília, Paris…).
- **Placa no mapa:** cada cidade mostra o nome acima do prédio, com um filete na cor da nação. A capital
  tem uma estrela.
- **Lista de cidades:** `shared/data/cities.ts` tem 16 cidades para cada um dos 27 países.
- **Distância mínima:** a prefeitura fica a pelo menos **10 células** (centro a centro) de qualquer
  outra prefeitura e de qualquer QG, de qualquer país. O fantasma de construção mostra o motivo quando
  o lugar é perto demais.

## Captura
Quando um inimigo destrói uma prefeitura pronta, ela **não some**: a cidade passa para ele.

- **Prefeitura:** fica com o novo dono, com 30% da vida.
- **Edifícios vinculados:** os do antigo dono num raio de **8 células** da prefeitura também passam
  para o novo dono. O QG nunca é tomado: perto ou não, só cai se for destruído.
- **Ao trocar de dono:**
  - filas de produção, obras de melhoria e pesquisas militares são canceladas, sem reembolso;
  - os trabalhadores voltam para o antigo dono;
  - o petróleo de um tanque capturado vai junto com ele;
  - o antigo dono perde a capacidade de armazenamento da cidade, e o excedente se perde;
  - aviões do antigo dono no hangar de uma base aérea capturada se perdem;
  - aviões dele em missão não têm onde pousar;
  - um lançamento de míssil em preparação num silo capturado é abortado;
  - modernizações de unidades do antigo dono na instalação capturada são canceladas.
- **Fronteira:** é recalculada, e o território em volta da cidade passa ao novo dono.
- **Retomada:** a cidade pode ser tomada de volta da mesma forma.
- **Prefeitura em obra:** se for destruída, some como qualquer edifício.
- **Aviso no mapa:** quem conquista e quem perde recebem um aviso com o nome da cidade e quantos
  edifícios vieram junto. No mapa, a cidade troca de cores com um clarão e uma onda do tamanho do
  raio da cidade.

## IA
- **Quando funda:** depois da fábrica e da primeira torre, a IA funda até duas cidades na fronteira.
  Ela procura um lugar a até 17 células do QG.
- **Junta material:** enquanto junta material para a prefeitura (com um lugar válido disponível),
  segura as melhorias para não gastar a pedra.
- **Lugar válido:** é reavaliado a cada 30 s. A avaliação entra no salvamento da partida.

## Testes
`shared/test/cities.test.ts` cobre:

- nomes reais sem repetição;
- capital no QG;
- fallback de nomes;
- distância mínima contra prefeituras e QGs;
- captura com os edifícios no raio, sem o QG, com o petróleo do tanque e sem fila;
- fronteira recalculada;
- retomada;
- obra destruída normalmente;
- base aérea capturada;
- salvar e carregar.
