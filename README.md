# MiniFlyMap

Planejador web de missões para mapeamento aéreo, com foco em DJI Mini 5 Pro.

## Funcionalidades

- desenho e edição da área de voo sobre mapa interativo;
- importação de KML, KMZ e DXF;
- cálculo fotogramétrico de área, GSD, espaçamento, fotos, distância e tempo estimado;
- direção automática ou manual e varredura cruzada;
- definição do ponto inicial e inversão da rota;
- divisão automática de missões longas;
- exportação KML de prévia e KMZ/WPML para uso no fluxo de missões do DJI Fly;
- armazenamento local de projetos no navegador;
- imagem de satélite com nomenclatura de vias do Google via Map Tiles API.

## Desenvolvimento

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm exec vitest run --root . tests/corePlanner.test.ts
pnpm exec vite build
```

Para exibir a camada de vias do Google sobre o satélite, configure:

```bash
VITE_GOOGLE_MAPS_API_KEY=sua_chave_google_maps_platform
```

A chave deve ter acesso à **Map Tiles API** e, por ser usada no navegador, deve ser restringida no Google Cloud por **HTTP referrer** ao domínio do MiniFlyMap e por API à **Map Tiles API**.

## Deploy no Vercel

O repositório inclui `vercel.json`. Ao importar o projeto no Vercel, use a raiz do repositório e mantenha as configurações do arquivo versionado.

Saída estática: `dist/public`.

No Vercel, adicione `VITE_GOOGLE_MAPS_API_KEY` em **Settings → Environment Variables** para Production (e Preview se desejar testar em previews) e faça um novo deploy após salvar.

## Compatibilidade DJI

O MiniFlyMap gera arquivos de missão; ele não controla a aeronave diretamente. Antes de qualquer voo, a missão deve ser aberta e revisada no DJI Fly, incluindo rota, altura relativa, retorno, gimbal e ações de foto.

A compatibilidade de `droneEnumValue 68` com Mini 5 Pro permanece configurável e deve ser validada no equipamento/versão do DJI Fly utilizados.

## Documentação técnica

- `docs/WPML_PROVENANCE.md` — origem e critérios da implementação WPML.
- `docs/COMMERCIAL_READINESS.md` — pendências antes de qualquer distribuição comercial.
