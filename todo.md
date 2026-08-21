# Correção do KMZ com coordenadas

- [x] Auditar a estrutura atual do `buildKmz` e o `KmzExporter.kt` original.
- [x] Confirmar onde o Android grava coordenadas, índices, alturas e ações.
- [x] Incluir a geometria do limite e os waypoints calculados no XML correto.
- [x] Garantir que todos os waypoints tenham `<coordinates>longitude,latitude,altitude</coordinates>`.
- [x] Validar que o KMZ contém `wpmz/template.kml` e `wpmz/waylines.wpml` não vazios.
- [x] Validar contagem de coordenadas antes de permitir o download.
- [x] Incluir `wpmz/coordinates.csv` para conferência humana das coordenadas.
- [x] Executar TypeScript e build de produção.
- [ ] Validar a importação do KMZ em um DJI Fly real antes de uso operacional.
