# VerAcist Cloud 1.1B — conexão do PWA ao Supabase

## O que esta versão faz
- Login por e-mail/senha com Supabase Auth.
- Solicitações e ocorrências gravadas no PostgreSQL central.
- Grids carregados da nuvem em qualquer aparelho autenticado.
- Agendamento de uma solicitação cria/atualiza automaticamente a Visita Técnica via trigger do banco.
- Execução da visita grava horários, quilometragem e resultado das ocorrências na nuvem.
- Status “Com pendências” / “Finalizada” são calculados pelo banco e propagados para a solicitação.
- Reagendamento usa a RPC `reschedule_visit` e preserva histórico.
- Perfis `admin`, `office` e `technician` alteram as ações disponíveis na interface.

## Ainda local neste ciclo
Fotos, vídeos e assinaturas continuam funcionais no aparelho, mas ainda não são compartilhados entre dispositivos. O Storage compartilhado entra no Cloud 1.2.

## Antes de publicar
1. O `01_veracist_schema.sql` deve ter sido executado no Supabase.
2. Execute também `03_cloud_1_1b_patch.sql` no SQL Editor.
3. Confira os usuários em Authentication > Users e seus perfis em `public.profiles`.
4. Publique todos os arquivos desta pasta no Netlify/GitHub.

## Homologação em dois aparelhos
1. Abra o PWA no aparelho A e faça login como admin/office.
2. Abra o mesmo endereço no aparelho B e faça login com outro usuário.
3. No A, crie uma SAT e salve.
4. No B, abra Solicitações ou toque em Atualizar. A SAT deve aparecer.
5. No A, altere a SAT para Agendada e informe data, horário e técnico.
6. No B, abra Visitas ou toque em Atualizar. A VT deve aparecer automaticamente.
7. No B, realize a visita, marque as ocorrências e salve.
8. No A, atualize: visita e solicitação devem mostrar “Com pendências” ou “Finalizada” de acordo com os resultados.

## Segurança
O arquivo `config.js` contém somente Project URL e Publishable Key, próprias para uso no navegador. Não coloque `service_role`, Secret Key ou senha do banco no PWA.
