# VerAcist PWA

Aplicativo web instalável para gestão de solicitações de assistência técnica e visitas técnicas.

## Incluído
- Portal inicial
- Painel de solicitações
- Cadastro/edição/cancelamento/agendamento
- Criação automática de visita ao confirmar agendamento
- Painel de visitas
- Execução de ocorrências
- Status automáticos: Com pendências / Finalizada
- Reagendamento de pendências
- Impressão/PDF
- Manifesto PWA + ícones
- Service Worker + cache offline
- Configuração Netlify

## Armazenamento
Esta versão é um MVP local-first. Dados operacionais ficam no armazenamento local do navegador/aparelho. Para produção multiusuário e sincronização entre técnicos, conectar um backend (Supabase/Firebase/Postgres) e storage de mídia.

## Teste local
```bash
python3 -m http.server 8080
```
Abra http://localhost:8080

## Publicação
A pasta pode ser publicada como site estático no Netlify, Vercel, Firebase Hosting ou servidor HTTPS.
