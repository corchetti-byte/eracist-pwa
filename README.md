# VerAcist Cloud 1.1B

Primeira versão do PWA VerAcist conectada ao Supabase para trabalho multiusuário.

## Fluxos centralizados
- Login Supabase Auth
- Solicitações e ocorrências no PostgreSQL
- Agendamento cria Visita Técnica automaticamente no banco
- Painel de visitas compartilhado
- Execução, horários, KM e resultados das ocorrências compartilhados
- Status Com pendências / Finalizada propagados automaticamente
- Reagendamento com histórico
- Perfis admin / office / technician

## Cloud 1.2
Fotos, vídeos e assinaturas ainda são locais neste pacote. O Cloud 1.2 migrará esses arquivos para Supabase Storage.

## Instalação
1. Execute `01_veracist_schema.sql` se ainda não executou o schema inicial.
2. Execute `03_cloud_1_1b_patch.sql` no SQL Editor.
3. Confira usuários e perfis.
4. Publique esta pasta inteira no Netlify/GitHub substituindo a versão anterior.
5. Abra em dois aparelhos e siga `GUIA_CLOUD_1_1B.md`.

## Configuração
`config.js` já contém a Project URL e a Publishable Key informadas para este projeto. Não adicionar Secret Key, service_role ou senha do banco.
