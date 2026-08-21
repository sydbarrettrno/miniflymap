# Direção de design — NV Drone Mapping

## Abordagens consideradas

### Abordagem 1 — Cartografia de campo
**Very Brief Intro:** Uma estação técnica clara, inspirada em cartas topográficas, pranchetas de inspeção e interfaces de navegação profissional. A sensação deve ser de precisão, confiança e leitura rápida em campo.
**Probability:** 0.06

### Abordagem 2 — Oficina editorial
**Very Brief Intro:** Uma interface de planejamento com papel quente, tipografia editorial e blocos de anotação, aproximando o app de um caderno de engenharia cuidadosamente organizado. A sensação é mais humana e documental.
**Probability:** 0.03

### Abordagem 3 — Painel noturno de missão
**Very Brief Intro:** Uma central escura de monitoramento com acentos âmbar e ciano, inspirada em consoles de operação e telemetria. A sensação é de prontidão e controle, sem recorrer a excesso de brilho.
**Probability:** 0.08

## Abordagem escolhida — Cartografia de campo

### Design Movement
Cartografia modernista suíça aplicada a ferramentas de campo, combinada com linguagem visual de aviação civil e documentação técnica.

### Core Principles
1. **Mapa como espaço de decisão:** a área, a rota e o sentido de voo devem dominar a composição.
2. **Hierarquia operacional:** ações críticas ficam sempre separadas de ajustes secundários e mostram seu estado.
3. **Precisão legível:** unidades, valores e alertas usam tipografia clara, contraste alto e pouco ruído visual.
4. **Revisão antes da exportação:** cada etapa termina com uma confirmação compreensível, não com uma ação ambígua.

### Color Philosophy
A base usa azul-marinho profundo e marfim cartográfico para transmitir confiança e continuidade com a versão Android. Um verde-pinho próprio, **#0D7C66**, indica ações válidas e o estado de rota pronta. O amarelo ocre **#C18A35** sinaliza revisão necessária, nunca decoração. O vermelho ferrugem aparece apenas para bloqueios e riscos operacionais. A cor deve funcionar tanto em telas internas quanto sobre o mapa claro.

### Layout Paradigm
Um layout assimétrico de estação de planejamento: navegação estreita à esquerda, mapa dominante no centro e uma coluna de revisão à direita. Abaixo do mapa, uma faixa de etapas funciona como trilho operacional. Em telas menores, a coluna direita torna-se uma gaveta inferior.

### Signature Elements
- Molduras de mapa com linhas finas e coordenadas discretas, como uma folha cartográfica.
- Etiquetas de estado em formato de cápsula curta, com cor semântica e ícone simples.
- Uma linha vertical de progresso com quatro etapas: Área, Parâmetros, Revisão e Exportação.

### Interaction Philosophy
Cada interação deve deixar evidente o que foi alterado. Desenhar ativa um modo explícito; clicar no mapa adiciona um ponto apenas nesse modo; editar parâmetros atualiza a revisão; exportar abre um resumo com as decisões críticas. Ações destrutivas exigem confirmação e ações indisponíveis explicam o motivo.

### Animation
Transições curtas de 160–220 ms para mudança de etapa, seleção de camadas e abertura de revisão. Pontos recém-criados entram com escala de 0,95 para 1 e opacidade crescente, sem saltos. A rota desenhada aparece com uma progressão suave apenas na primeira geração. Respeitar `prefers-reduced-motion` e não animar o mapa durante interações frequentes.

### Typography System
Títulos em **Barlow Condensed**, com peso 600–700, para uma presença técnica compacta. Corpo e dados em **DM Sans**, com 400–600 para leitura confortável. Valores operacionais usam DM Sans semibold e espaçamento de caracteres ligeiramente maior. Evitar caixa alta em frases longas; reservar uppercase para pequenos rótulos de estado.

### Brand Essence
**NV Drone Mapping é a prancheta digital de engenheiros e operadores que precisam transformar uma área em uma missão revisável, sem esconder as decisões críticas.** Personalidade: preciso, responsável, direto.

### Brand Voice
Headlines são objetivas e orientadas à próxima decisão. CTAs usam verbos claros. Microcopy explica consequências em uma frase, sem alarmismo.

Exemplos:
- “Desenhe a área. Nós mostramos o que será exportado.”
- “Revise altura, sentido e retorno antes de criar a missão.”

### Wordmark & Logo
O símbolo é um quadrado cartográfico aberto em um canto, atravessado por uma linha de voo em diagonal e um ponto de waypoint. O wordmark combina “NV” em Barlow Condensed semibold com “MAPPING” em DM Sans com espaçamento amplo; nunca usar o nome em uma fonte padrão sem o símbolo.

### Signature Brand Color
**Verde rota #0D7C66** — a cor própria da marca, usada para indicar que a geometria foi convertida em rota e está pronta para revisão.

## Style Decisions

- O mapa será o elemento dominante, não um fundo decorativo.
- O protótipo será funcional com dados simulados locais e deixará claro quando uma ação é uma simulação de exportação.
- A interface usará linguagem brasileira, unidades métricas e alertas operacionais explícitos.
