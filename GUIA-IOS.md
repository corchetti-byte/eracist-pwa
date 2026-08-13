# VerAcist PWA — Publicação e instalação no iPhone

## 1. Descompacte o pacote
No app Arquivos do iPhone, toque no ZIP para criar a pasta do projeto.

## 2. Crie um repositório no GitHub
Crie um repositório chamado `veracist-pwa`.

## 3. Envie todos os arquivos do projeto
Envie `index.html`, `manifest.webmanifest`, `service-worker.js`, `offline.html`, `netlify.toml`, `README.md`, `GUIA-IOS.md` e a pasta `icons`.

## 4. Publique no Netlify
No Netlify, escolha Add new project > Import an existing project > GitHub. Selecione o repositório `veracist-pwa` e publique. Não há comando de build; o diretório de publicação é a raiz do projeto (`.`).

## 5. Abra o endereço HTTPS no Safari
Depois do deploy, o Netlify fornecerá um endereço `https://...netlify.app`.

## 6. Instale como web app
No Safari do iPhone, abra o endereço, use Compartilhar/More > Adicionar à Tela de Início e confirme o nome `VerAcist`.

## 7. Primeiro uso
Abra o app instalado conectado à internet uma vez para que o cache offline seja preparado.

## Observação importante
Esta versão é local-first: os dados operacionais ficam no navegador/aparelho. Para sincronizar técnicos, fotos, vídeos e históricos entre vários aparelhos, conecte um backend e armazenamento em nuvem.
