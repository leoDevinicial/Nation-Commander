#!/usr/bin/env python3
"""
Prepara os efeitos sonoros do jogo (04/11): lê os originais em `assets/sfx/originais/` (ver `assets/sfx/CATALOGO.md`),
recorta (início, fim e fade), converte para mono 44,1 kHz, iguala o volume médio do grupo e grava MP3 leve em
`public/sfx/`. Precisa do ffmpeg (e do numpy para os loops). Rodar da raiz: `python3 scripts/sfx-preparar.py`.

`CLIPS` são os lotes 1–8; `MORE` (lotes 9–32, ver o catálogo) aceita também fade de entrada e estéreo. `LOOPS` monta
clipes para tocar em loop sem emenda: o trecho [início, fim] com os últimos `cruz` segundos misturados ao que vem antes
do início (assim o fim do loop continua no começo dele); `intro` mantém o que vem antes como entrada (a sirene sobe e
depois o loop começa em `intro` segundos, valor usado no `AudioService`).
"""
import os
import re
import subprocess

SRC = 'assets/sfx/originais'
OUT = 'public/sfx'

# (saída, original, início s, fim s, fade final s, média alvo dB)
CLIPS = [
    ('tanque-tiro-1', 'tanque-tiro/tanque-tiro-1', 0.0, 3.0, 1.2, -19),
    ('tanque-tiro-2', 'tanque-tiro/tanque-tiro-2', 0.0, 3.0, 1.0, -19),
    ('tanque-tiro-3', 'tanque-tiro/tanque-tiro-2', 3.2, 6.2, 1.0, -19),
    ('tanque-tiro-4', 'tanque-tiro/tanque-tiro-3', 0.0, 3.0, 1.0, -19),
    ('tanque-tiro-5', 'tanque-tiro/tanque-tiro-4', 0.0, 3.0, 1.0, -19),
    ('explosao-grande-1', 'explosao-grande/explosao-grande-2', 0.0, 6.0, 2.0, -17),
    ('explosao-grande-2', 'explosao-grande/explosao-grande-3', 0.0, 6.0, 2.0, -17),
    ('explosao-grande-3', 'explosao-grande/explosao-grande-4', 0.0, 6.0, 2.0, -17),
    ('missil-lancamento-1', 'missil-lancamento/missil-lancamento-1', 0.0, 4.0, 1.5, -18),
    ('missil-lancamento-2', 'missil-lancamento/missil-lancamento-2', 0.0, 4.5, 1.5, -18),
    ('missil-lancamento-3', 'missil-lancamento/missil-lancamento-3', 0.0, 4.0, 1.5, -18),
    ('missil-lancamento-4', 'missil-lancamento/missil-lancamento-4', 0.0, 4.0, 1.5, -18),
    ('missil-impacto-1', 'missil-impacto/missil-impacto-1', 0.0, 5.0, 1.5, -18),
    ('missil-impacto-2', 'missil-impacto/missil-impacto-2', 0.9, 5.9, 1.5, -18),
    ('missil-impacto-3', 'missil-impacto/missil-impacto-3', 0.0, 4.8, 1.5, -18),
    ('missil-impacto-4', 'missil-impacto/missil-impacto-4', 0.6, 6.4, 1.5, -18),
    ('metralhadora-tiro-1', 'metralhadora-tiro/metralhadora-tiro-1', 0.0, 0.9, 0.35, -20),
    ('metralhadora-tiro-2', 'metralhadora-tiro/metralhadora-tiro-2', 0.0, 0.9, 0.35, -20),
    ('metralhadora-tiro-3', 'metralhadora-tiro/metralhadora-tiro-3', 0.0, 0.9, 0.35, -20),
    ('metralhadora-tiro-4', 'metralhadora-tiro/metralhadora-tiro-4', 0.0, 0.9, 0.35, -20),
    ('metralhadora-rajada-1', 'metralhadora-rajada/metralhadora-rajada-1', 0.0, 1.5, 0.6, -20),
    ('metralhadora-rajada-2', 'metralhadora-rajada/metralhadora-rajada-2', 0.0, 2.1, 0.6, -20),
    ('metralhadora-rajada-3', 'metralhadora-rajada/metralhadora-rajada-3', 0.0, 1.4, 0.6, -20),
    ('metralhadora-rajada-4', 'metralhadora-rajada/metralhadora-rajada-4', 0.0, 2.5, 0.6, -20),
    ('artilharia-distante-1', 'artilharia-distante/artilharia-distante-1', 0.0, 7.0, 2.0, -24),
    ('artilharia-distante-2', 'artilharia-distante/artilharia-distante-2', 0.0, 7.0, 2.0, -24),
    ('artilharia-distante-3', 'artilharia-distante/artilharia-distante-3', 0.0, 7.0, 2.0, -24),
    ('artilharia-distante-4', 'artilharia-distante/artilharia-distante-4', 0.0, 7.0, 2.0, -24),
    ('energia-desligando', 'energia-desligando/energia-desligando-1', 0.0, 3.2, 1.0, -22),
]


# lotes 9–32: (saída, original, início s, fim s, fade final s, média alvo dB, fade de entrada s)
MORE = [
    # antiaérea das eras 1–3: rajadas rápidas (lote 9) e recortes de 6–9 tiros do fogo contínuo (lote 31)
    *[(f'antiaerea-rajada-{i}', f'antiaerea-rajada/antiaerea-rajada-{i}', 0.0, 1.1, 0.25, -20, 0) for i in range(1, 5)],
    ('antiaerea-continua-1', 'antiaerea-continua/antiaerea-continua-1a', 0.15, 1.1, 0.25, -20, 0),
    ('antiaerea-continua-2', 'antiaerea-continua/antiaerea-continua-1a', 2.0, 2.95, 0.25, -20, 0.01),
    ('antiaerea-continua-3', 'antiaerea-continua/antiaerea-continua-1a', 3.5, 4.45, 0.25, -20, 0.01),
    ('antiaerea-continua-4', 'antiaerea-continua/antiaerea-continua-1b', 0.0, 1.0, 0.4, -20, 0),
    ('antiaerea-continua-5', 'antiaerea-continua/antiaerea-continua-1b', 5.05, 6.1, 0.4, -20, 0),
    ('antiaerea-continua-6', 'antiaerea-continua/antiaerea-continua-4', 0.05, 1.0, 0.25, -20, 0),
    ('antiaerea-continua-7', 'antiaerea-continua/antiaerea-continua-4', 4.5, 5.5, 0.3, -20, 0.01),
    # antiaérea da era 4 (dois disparos; a 3, distante, ficou de fora)
    ('antiaerea-era4-1', 'antiaerea-era4-duplo/antiaerea-era4-duplo-1', 0.0, 1.0, 0.4, -21, 0),
    ('antiaerea-era4-2', 'antiaerea-era4-duplo/antiaerea-era4-duplo-2', 0.09, 1.6, 0.6, -21, 0),
    ('antiaerea-era4-3', 'antiaerea-era4-duplo/antiaerea-era4-duplo-4', 0.04, 1.0, 0.4, -21, 0),
    # veículo explodindo (lote 10): leves/médios e os pesados com munição cozinhando
    ('veiculo-explosao-1', 'veiculo-explosao/veiculo-explosao-1', 0.0, 3.0, 1.2, -19, 0),
    ('veiculo-explosao-2', 'veiculo-explosao/veiculo-explosao-3', 0.0, 2.8, 1.2, -19, 0),
    ('veiculo-explosao-3', 'veiculo-explosao/veiculo-explosao-2', 0.06, 2.3, 0.8, -19, 0),
    ('veiculo-explosao-4', 'veiculo-explosao/veiculo-explosao-4', 0.2, 2.4, 0.8, -19, 0),
    ('veiculo-explosao-pesada-1', 'veiculo-explosao/veiculo-explosao-2', 0.06, 4.0, 1.3, -18, 0),
    ('veiculo-explosao-pesada-2', 'veiculo-explosao/veiculo-explosao-4', 0.2, 3.6, 1.2, -18, 0),
    # aviões (lotes 11 e 13): roncos inteiros; o vem-e-vai é feito no jogo (`pass` no AudioService)
    *[(f'jato-voando-{i}', f'jato-voando/jato-voando-{i}', 0.0, 8.0, 0.3, -18, 0) for i in (2, 3, 4)],
    ('bombardeiro-passagem', 'bombardeiro-voando/bombardeiro-voando-1', 0.0, 8.0, 1.0, -20, 0),
    *[(f'bombardeiro-voando-{i}', f'bombardeiro-voando/bombardeiro-voando-{i}', 0.0, 8.0, 0.3, -18, 0) for i in (2, 3, 4)],
    # Domo de Ferro (lotes 12 e 16) e interceptação no ar (lote 17)
    ('domo-interceptacao-1', 'domo-interceptacao/domo-interceptacao-2', 0.0, 1.5, 0.6, -22, 0),
    ('domo-interceptacao-2', 'domo-interceptacao/domo-interceptacao-3', 0.06, 1.5, 0.6, -22, 0),
    ('domo-eco-1', 'domo-interceptacao/domo-interceptacao-1', 0.0, 2.0, 1.0, -22, 0.03),
    ('domo-eco-2', 'domo-interceptacao/domo-interceptacao-4', 0.0, 2.2, 1.0, -22, 0.03),
    ('domo-lancamento-1', 'domo-lancamento/domo-lancamento-1', 0.06, 2.3, 0.8, -19, 0),
    ('domo-lancamento-2', 'domo-lancamento/domo-lancamento-3', 0.12, 2.3, 0.8, -19, 0),
    ('domo-lancamento-3', 'domo-lancamento/domo-lancamento-4', 0.02, 2.6, 0.8, -19, 0),
    *[(f'interceptacao-no-ar-{i}', f'interceptacao-no-ar/interceptacao-no-ar-{i}', 0.0, 1.5, 0.5, -20, 0) for i in range(1, 5)],
    # bombas (lotes 14 e 15): só o fim do assobio (o jogo solta as bombas ~1 s depois) e o trovão do tapete
    ('bomba-assobio-1', 'bomba-assobio/bomba-assobio-1', 2.0, 3.3, 0.15, -18, 0.25),
    ('bomba-assobio-2', 'bomba-assobio/bomba-assobio-2', 1.3, 2.6, 0.15, -18, 0.25),
    ('bomba-assobio-3', 'bomba-assobio/bomba-assobio-3', 1.3, 2.6, 0.15, -18, 0.25),
    ('bomba-assobio-4', 'bomba-assobio/bomba-assobio-4', 1.4, 2.7, 0.15, -18, 0.25),
    ('bombardeio-tapete-1', 'bombardeio-tapete/bombardeio-tapete-2', 0.0, 5.0, 2.0, -19, 0),
    ('bombardeio-tapete-2', 'bombardeio-tapete/bombardeio-tapete-3', 0.2, 5.2, 2.0, -19, 0),
    # CIWS (lote 18): rajada de ~1,8 s
    ('ciws-gatling-1', 'ciws-gatling/ciws-gatling-1', 0.1, 1.9, 0.15, -19, 0),
    *[(f'ciws-gatling-{i}', f'ciws-gatling/ciws-gatling-{i}', 0.0, 1.8, 0.15, -19, 0) for i in (2, 3, 4)],
    # nuclear (lote 19)
    ('explosao-nuclear-1', 'explosao-nuclear/explosao-nuclear-1', 0.04, 8.0, 3.0, -18, 0),
    ('explosao-nuclear-2', 'explosao-nuclear/explosao-nuclear-2', 0.11, 8.1, 3.0, -18, 0),
    ('explosao-nuclear-3', 'explosao-nuclear/explosao-nuclear-3', 0.13, 8.1, 3.0, -18, 0),
    ('explosao-nuclear-4', 'explosao-nuclear/explosao-nuclear-4', 0.2, 8.2, 3.0, -18, 0),
    # Programa Espacial (lote 20): contagem em inglês com a ignição em 2,5 s e o "zero" em ~9,7 s (o usuário ouviu o "cinco"
    # na decolagem quando ela caía em 4,7 s); sem a voz a partir de 2,3 s
    ('espaco-contagem-en', 'espaco-lancamento/espaco-contagem-e-lancamento', 0.0, 13.0, 2.5, -16, 0),
    ('espaco-ignicao', 'espaco-lancamento/espaco-contagem-e-lancamento', 2.3, 13.0, 2.5, -16, 0.05),
    ('espaco-decolagem', 'espaco-lancamento/espaco-decolagem-2', 0.0, 11.0, 4.0, -16, 0),
    # blindado (lote 21): tiros únicos para a rajada de 3 e a rajada embolada
    ('blindado-canhao-1', 'blindado-canhao/blindado-canhao-4', 0.07, 0.8, 0.3, -20, 0),
    ('blindado-canhao-2', 'blindado-canhao/blindado-canhao-3', 0.0, 0.8, 0.3, -20, 0),
    ('blindado-canhao-3', 'blindado-canhao/blindado-canhao-2', 0.0, 1.5, 0.6, -21, 0),
    # sirene de ataque (lote 22): o começo da subida, para o aviso "sob ataque"
    ('sirene-aviso', 'sirene-ataque-aereo/sirene-ataque-aereo-4', 0.0, 2.2, 0.8, -20, 0),
    # canhão (lote 23), obus (lote 25), explosão pequena (lote 26)
    *[(f'canhao-tiro-{i}', f'canhao-tiro/canhao-tiro-{i}', 0.0, 2.0, 0.8, -20, 0) for i in range(1, 5)],
    ('obus-tiro-1', 'obus-tiro/obus-tiro-1', 0.05, 3.5, 1.2, -20, 0),
    ('obus-tiro-2', 'obus-tiro/obus-tiro-2', 0.08, 3.0, 1.0, -20, 0),
    ('obus-tiro-3', 'obus-tiro/obus-tiro-3', 2.03, 4.2, 0.8, -20, 0),
    ('obus-tiro-4', 'obus-tiro/obus-tiro-3', 4.2, 6.0, 0.8, -20, 0),
    ('obus-distante', 'obus-tiro/obus-tiro-4', 0.0, 4.0, 1.5, -24, 0),
    *[(f'explosao-pequena-{i}', f'explosao-pequena/explosao-pequena-{i}', 0.0, 1.0, 0.35, -19, 0) for i in range(1, 5)],
    # lança-foguetes (lote 27): um lançamento por foguete e o ronco da salva inteira
    ('foguete-lancamento-1', 'lanca-foguetes/lanca-foguetes-lancamentos', 0.0, 2.6, 0.8, -20, 0),
    ('foguete-lancamento-2', 'lanca-foguetes/lanca-foguetes-lancamentos', 2.78, 5.0, 0.8, -20, 0),
    ('foguete-lancamento-3', 'lanca-foguetes/lanca-foguetes-lancamentos', 5.08, 7.5, 0.8, -20, 0),
    ('foguete-lancamento-4', 'lanca-foguetes/lanca-foguetes-lancamentos', 9.88, 12.4, 0.8, -20, 0),
    ('foguete-salva', 'lanca-foguetes/lanca-foguetes-salva-continua', 0.0, 2.2, 0.8, -18, 0),
    # torre (lote 28): cortada antes do eco tardio
    ('torre-defesa-1', 'torre-defesa/torre-defesa-2', 0.0, 0.8, 0.3, -20, 0),
    ('torre-defesa-2', 'torre-defesa/torre-defesa-3', 0.2, 1.0, 0.3, -20, 0),
    # canhão do caça (lote 29)
    ('caca-canhao-1', 'caca-canhao/caca-canhao-m61-rajada-longa', 0.0, 1.0, 0.12, -18, 0),
    ('caca-canhao-2', 'caca-canhao/caca-canhao-m61-rajada-longa', 0.85, 1.9, 0.12, -18, 0.01),
    ('caca-canhao-3', 'caca-canhao/caca-canhao-rajada-curta', 1.66, 3.6, 1.2, -18, 0),
    # míssil ar-ar (lote 30)
    ('missil-ar-ar-1', 'missil-ar-ar/missil-ar-ar-1', 0.08, 2.0, 0.8, -19, 0),
    ('missil-ar-ar-2', 'missil-ar-ar/missil-ar-ar-2', 0.1, 1.4, 0.5, -19, 0),
    ('missil-ar-ar-3', 'missil-ar-ar/missil-ar-ar-3', 0.02, 2.4, 0.8, -19, 0),
    ('missil-ar-ar-4', 'missil-ar-ar/missil-ar-ar-4', 0.1, 2.0, 0.8, -19, 0),
    # lote 33 (07/11, ElevenLabs): estouro antiaéreo, míssil ar-terra, drone passando, silo, trovão e interface
    ('antiaerea-estouro-1', 'antiaerea-estouro/antiaerea-estouro-1', 0.4, 1.5, 0.6, -19, 0.01),
    ('antiaerea-estouro-2', 'antiaerea-estouro/antiaerea-estouro-2', 0.4, 1.6, 0.6, -19, 0.01),
    ('missil-ar-terra-1', 'missil-ar-terra/missil-ar-terra-1', 0.0, 2.4, 0.8, -19, 0),
    ('missil-ar-terra-2', 'missil-ar-terra/missil-ar-terra-2', 0.0, 2.4, 0.8, -19, 0),
    ('drone-passagem-1', 'drone-passagem/drone-passagem-1', 0.0, 4.0, 0.8, -22, 0.2),
    ('drone-passagem-2', 'drone-passagem/drone-passagem-2', 0.2, 3.4, 0.8, -22, 0.2),
    ('silo-preparo-1', 'silo-preparo/silo-preparo-1', 0.0, 3.6, 0.8, -19, 0),
    ('silo-preparo-2', 'silo-preparo/silo-preparo-2', 0.0, 3.6, 0.8, -19, 0),
    ('silo-autorizado-1', 'silo-autorizado/silo-autorizado-1', 0.0, 1.8, 0.5, -19, 0),
    ('silo-autorizado-2', 'silo-autorizado/silo-autorizado-2', 0.4, 2.4, 0.5, -19, 0),
    ('trovao-1', 'trovao/trovao-1', 0.0, 5.5, 2.0, -19, 0),
    ('trovao-2', 'trovao/trovao-2', 0.0, 5.5, 2.0, -19, 0),
    ('ui-clique-1', 'interface/ui-clique-1', 0.0, 0.25, 0.1, -22, 0),
    ('ui-clique-2', 'interface/ui-clique-2', 0.2, 0.48, 0.1, -22, 0),
    ('ui-confirmar-1', 'interface/ui-confirmar-1', 0.0, 0.8, 0.25, -22, 0),
    ('ui-confirmar-2', 'interface/ui-confirmar-2', 0.0, 0.6, 0.2, -22, 0),
    ('ui-erro-1', 'interface/ui-erro-1', 0.0, 0.55, 0.2, -22, 0),
    ('ui-erro-2', 'interface/ui-erro-2', 0.0, 0.45, 0.15, -22, 0),
    ('ui-alerta-1', 'interface/ui-alerta-1', 0.0, 1.3, 0.4, -22, 0),
    ('ui-alerta-2', 'interface/ui-alerta-2', 0.0, 1.45, 0.4, -22, 0),
    ('ui-sucesso-1', 'interface/ui-sucesso-1', 0.0, 1.25, 0.5, -22, 0),
    ('ui-sucesso-2', 'interface/ui-sucesso-2', 0.0, 1.0, 0.4, -22, 0),
    ('ui-anuncio-1', 'interface/ui-anuncio-1', 0.0, 1.9, 0.7, -22, 0),
    ('ui-anuncio-2', 'interface/ui-anuncio-2', 0.0, 1.6, 0.6, -22, 0),
    # lote 34 (07/11): "segurar" (início do aperto longo) e o anúncio mundial grave
    ('ui-segurar-1', 'interface/ui-segurar-1', 0.0, 0.5, 0.2, -22, 0),
    ('ui-segurar-2', 'interface/ui-segurar-2', 0.0, 0.42, 0.15, -22, 0),
    ('ui-aviso-grave-1', 'interface/ui-aviso-grave-1', 0.0, 2.3, 0.8, -22, 0),
    ('ui-aviso-grave-2', 'interface/ui-aviso-grave-2', 0.0, 2.2, 0.6, -22, 0),
    # lote 35 (07/11): marinha (canhão da fragata, torpedo, explosão na água, navio afundando) e a fanfarra de era
    ('canhao-naval-1', 'canhao-naval/canhao-naval-1', 0.0, 2.2, 1.0, -19, 0),
    ('canhao-naval-2', 'canhao-naval/canhao-naval-2', 0.0, 2.4, 1.0, -19, 0),
    ('torpedo-lancamento-1', 'torpedo-lancamento/torpedo-lancamento-1', 0.0, 2.8, 1.0, -19, 0),
    ('torpedo-lancamento-2', 'torpedo-lancamento/torpedo-lancamento-2', 0.0, 2.8, 1.0, -19, 0),
    ('explosao-agua-1', 'explosao-agua/explosao-agua-1', 0.0, 3.6, 1.3, -18, 0),
    ('explosao-agua-2', 'explosao-agua/explosao-agua-2', 0.0, 3.6, 1.3, -18, 0),
    ('navio-afundando-1', 'navio-afundando/navio-afundando-1', 0.65, 5.0, 1.5, -18, 0.01),
    ('navio-afundando-2', 'navio-afundando/navio-afundando-2', 0.0, 4.4, 1.5, -18, 0),
    ('era-fanfarra-1', 'era-fanfarra/era-fanfarra-1', 0.0, 3.2, 1.0, -20, 0),
    ('era-fanfarra-2', 'era-fanfarra/era-fanfarra-2', 0.0, 3.2, 1.0, -20, 0),
]

# contagem falada em português e espanhol (lote 33): a ignição gravada (`espaco-ignicao`, tocada 2,6 s depois do pedido,
# que vem 10 s antes da decolagem) com a voz por cima: "três" em T-3 (4,4 s no arquivo), um número por segundo e
# "ignição!" na decolagem. (saída, voz, início da voz no arquivo s, ganho da voz dB)
COUNTDOWNS = [
    ('espaco-contagem-pt', 'voz-contagem/voz-contagem-pt-1', 4.31, 12.0),
    ('espaco-contagem-es', 'voz-contagem/voz-contagem-es-1', 4.34, 12.0),
]

# loops sem emenda: (saída, original, início s, fim s, cruz s, média alvo dB, estéreo, intro)
LOOPS = [
    ('sirene-loop-1', 'sirene-ataque-aereo/sirene-ataque-aereo-2', 3.0, 9.0, 0.5, -19, False, True),
    ('sirene-loop-2', 'sirene-ataque-aereo/sirene-ataque-aereo-4', 1.5, 9.0, 0.5, -19, False, True),
    *[(f'vento-{i}', f'vento/vento-{i}', 1.0, 9.0, 0.8, None, True, False) for i in range(1, 5)],
    # lote 33 (07/11): chuva e vento de neve (estéreo) e a produção dos prédios (mono), duas variações de cada
    *[(f'chuva-{i}', f'chuva/chuva-{i}', 0.9, 9.7, 0.8, -24, True, False) for i in (1, 2)],
    *[(f'vento-neve-{i}', f'vento-neve/vento-neve-{i}', 0.9, 9.7, 0.8, -22, True, False) for i in (1, 2)],
    *[
        (f'producao-{k}-{i}', f'producao-predios/producao-{k}-{i}', 0.6, 7.6, 0.5, -22, False, False)
        for k in ('serraria', 'pedreira', 'mina', 'fabrica', 'petroleo', 'fazenda', 'aeroporto', 'porto', 'escritorio', 'zumbido')
        for i in (1, 2)
    ],
    # lote 34: bordo do drone de asa fixa (turboélice), mono; o jogo muda a rotação pela velocidade
    *[(f'drone-asa-fixa-{i}', f'drone-asa-fixa/drone-asa-fixa-{i}', 0.6, 7.6, 0.5, -20, False, False) for i in (1, 2)],
]


def decode(path: str, stereo: bool) -> 'np.ndarray':
    import numpy as np

    ch = 2 if stereo else 1
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', str(ch), '-ar', '44100', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, ch).copy()


def make_loop(name, src, start, end, cross, target, stereo, intro) -> None:
    """Loop sem emenda: os últimos `cross` s do trecho viram uma mistura com o que vem antes de `start`."""
    import numpy as np

    sr = 44100
    x = decode(os.path.normpath(os.path.join(SRC, src + '.mp3')), stereo)
    a, b, n = int(start * sr), int(end * sr), int(cross * sr)
    body = x[a:b].copy()
    fade = np.linspace(0, 1, n, dtype=np.float32)[:, None]
    body[-n:] = body[-n:] * (1 - fade) + x[a - n : a] * fade
    out = np.concatenate([x[:a], body]) if intro else body
    if target is not None:
        rms = float(np.sqrt((body**2).mean()))
        out = out * (10 ** (target / 20) / max(rms, 1e-6))
    out = np.clip(out, -0.89, 0.89)
    if intro:
        k = int(0.004 * sr)
        out[:k] *= np.linspace(0, 1, k, dtype=np.float32)[:, None]
    dst = os.path.join(OUT, name + '.mp3')
    subprocess.run(
        ['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', str(out.shape[1]), '-i', '-', '-c:a', 'libmp3lame', '-b:a', '96k' if stereo else '80k', dst],
        input=out.astype(np.float32).tobytes(),
        check=True,
    )
    print(f'{dst}: loop {end - start:.1f} s{f", entrada {start:.1f} s" if intro else ""}, {os.path.getsize(dst) // 1024} KB')


def mean_db(path: str, start: float, end: float) -> float:
    r = subprocess.run(
        ['ffmpeg', '-hide_banner', '-ss', str(start), '-to', str(end), '-i', path, '-ac', '1', '-af', 'volumedetect', '-f', 'null', '-'],
        capture_output=True,
        text=True,
    )
    m = re.search(r'mean_volume: (-?[\d.]+) dB', r.stderr)
    return float(m.group(1)) if m else -20.0


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, src, start, end, fade, target, *rest in [*CLIPS, *MORE]:
        fade_in = (rest[0] if rest else 0) or 0.004
        path = os.path.normpath(os.path.join(SRC, src + '.mp3'))
        gain = target - mean_db(path, start, end)
        dur = end - start
        af = f'volume={gain:.2f}dB,alimiter=limit=0.89:level=false,afade=t=in:d={fade_in},afade=t=out:st={dur - fade:.3f}:d={fade}'
        dst = os.path.join(OUT, name + '.mp3')
        subprocess.run(
            ['ffmpeg', '-y', '-v', 'error', '-ss', str(start), '-to', str(end), '-i', path, '-ac', '1', '-ar', '44100', '-af', af, '-c:a', 'libmp3lame', '-b:a', '80k', dst],
            check=True,
        )
        print(f'{dst}: {dur:.1f} s, ganho {gain:+.1f} dB, {os.path.getsize(dst) // 1024} KB')
    for loop in LOOPS:
        make_loop(*loop)
    for name, voice, at, gain in COUNTDOWNS:
        base = os.path.join(OUT, 'espaco-ignicao.mp3')
        src = os.path.normpath(os.path.join(SRC, voice + '.mp3'))
        dst = os.path.join(OUT, name + '.mp3')
        ms = int(at * 1000)
        # voz de rádio: banda de 300–3.800 Hz, comprimida, acima do ronco
        # o ronco cede enquanto a voz fala (sidechain), para os números não sumirem no fim da contagem
        graph = (
            f'[1:a]aformat=channel_layouts=mono,highpass=f=300,lowpass=f=3800,acompressor=threshold=-20dB:ratio=4,volume={gain}dB,adelay={ms},apad=whole_dur=11,asplit=2[v][k];'
            '[0:a]aformat=channel_layouts=mono[b];[b][k]sidechaincompress=threshold=0.015:ratio=5:attack=8:release=260[bd];'
            '[bd][v]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89:level=false[o]'
        )
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', base, '-i', src, '-filter_complex', graph, '-map', '[o]', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '80k', dst], check=True)
        print(f'{dst}: contagem com voz em {at:.2f} s, {os.path.getsize(dst) // 1024} KB')


if __name__ == '__main__':
    main()
