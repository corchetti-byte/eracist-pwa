# VerAcist PWA — versão de avaliação

Versão local-first do portal VerAcist para Solicitações de Assistência e Visitas Técnicas.

## Correções desta versão
- Fotos e vídeos por ocorrência com pré-visualização imediata e persistência em IndexedDB.
- Fotos e vídeos adicionais durante a execução da visita.
- Assinaturas desenháveis de vistoriador e cliente por toque, Apple Pencil ou mouse.
- Visualização completa de solicitações e visitas diretamente pelos grids.
- Impressão/PDF com conteúdo completo, fotos, status, ocorrências e assinaturas.
- Identidade visual Veraci com logo e background fornecidos.
- PWA com manifesto, service worker, cache offline e ícones iOS.

## Teste local
Execute na pasta:

    python3 -m http.server 8080

Abra `http://localhost:8080`.

## Observação
Os cadastros ficam em localStorage e as mídias em IndexedDB no aparelho. Para uso multiusuário em produção, conectar backend (Supabase/Firebase) e armazenamento de objetos.
