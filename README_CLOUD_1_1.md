# VerAcist Cloud 1.1

Primeiro ciclo para transformar o PWA local em uma aplicação multiusuário.

## Objetivo deste ciclo

- Supabase Auth para login.
- PostgreSQL central para Solicitações, Ocorrências e Visitas.
- RLS para separar permissões por perfil.
- Numeração SAT/VT segura para uso simultâneo.
- Criação automática de Visita ao agendar uma Solicitação.
- Propagação automática de status Finalizada / Com pendências.
- Histórico de agendamentos e reagendamentos.
- Estrutura preparada para Storage de fotos/vídeos no ciclo 1.2.

## Ordem

1. Criar projeto no Supabase.
2. Abrir SQL Editor.
3. Colar/executar `01_veracist_schema.sql`.
4. Criar pelo menos dois usuários em Authentication > Users.
5. Alterar os perfis dos usuários em `public.profiles` para `admin`, `office` ou `technician`.
6. Obter Project URL e Publishable key em Connect/API Keys.
7. NÃO compartilhar Secret key, service_role ou senha do banco.
8. Conectar o PWA ao projeto Supabase.
9. Testar em dois aparelhos.
10. Usar `02_validacao.sql` para conferência do banco.

## Perfis

- `admin`: gestão completa.
- `office`: cria/edita/agendamentos/reagendamentos.
- `technician`: consulta e executa visitas.

## Próximo ciclo

Cloud 1.2: Storage para fotos, vídeos e assinaturas.
