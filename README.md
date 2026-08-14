# VerAcist Cloud 1.2

Evolução do Cloud 1.1B com Supabase Storage privado.

## O que muda
- Fotos da Solicitação → Supabase Storage
- Vídeos da Solicitação → Supabase Storage
- Fotos/vídeos da execução → Supabase Storage
- Assinatura do vistoriador → Supabase Storage
- Assinatura do cliente → Supabase Storage
- Mídia acessível em todos os aparelhos autenticados
- URLs assinadas temporárias para bucket privado
- Upload retomável TUS para arquivos maiores que 6 MB
- PDFs/visualizações utilizam a mídia da nuvem

## Ordem de implantação
1. Execute `05_cloud_1_2_storage.sql`.
2. Execute `06_validacao_cloud_1_2.sql`.
3. Publique os arquivos do PWA.
4. Faça os testes descritos em `GUIA_CLOUD_1_2.md`.

Não publique nenhuma Secret Key no frontend.
