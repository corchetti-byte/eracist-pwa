# VerAcist Cloud 1.2 — Homologação de mídia em nuvem

## Objetivo do ciclo
Validar que fotos, vídeos e assinaturas deixam de depender do aparelho e passam a ser compartilhados entre usuários autenticados.

## 1. Executar o patch
No Supabase:
1. SQL Editor → New query.
2. Abra `05_cloud_1_2_storage.sql`.
3. Copie todo o conteúdo.
4. Run.
5. O esperado é `Success. No rows returned`.

Depois execute `06_validacao_cloud_1_2.sql`.

## 2. Publicar o PWA Cloud 1.2
Substitua no GitHub/Netlify os arquivos da versão Cloud 1.1B pelos arquivos desta pasta.

O `config.js` já mantém o mesmo Project URL e Publishable Key do projeto homologado.

## 3. Teste obrigatório A — foto na solicitação
Aparelho A / Administrador:
1. Nova solicitação.
2. Crie uma ocorrência.
3. Anexe uma fotografia.
4. Salve.

Aparelho B:
1. Atualize Solicitações.
2. Visualize a mesma SAT.
3. A fotografia deve aparecer.

## 4. Teste obrigatório B — vídeo
No aparelho A:
1. Edite a SAT.
2. Anexe um vídeo.
3. Salve.

No aparelho B:
1. Atualize.
2. Visualize a SAT.
3. O vídeo deve aparecer com player.

Arquivos acima de 6 MB usam upload retomável (TUS), recomendado para conexão instável.

## 5. Teste obrigatório C — execução
1. Agende a SAT.
2. Abra a VT em outro aparelho.
3. Em uma ocorrência, inclua nova foto/vídeo da execução.
4. Marque o resultado.
5. Assine como vistoriador e cliente.
6. Salve a visita.

No aparelho A:
1. Atualize o painel.
2. Visualize a VT.
3. Confirme:
   - mídia original;
   - mídia de execução;
   - assinatura do vistoriador;
   - assinatura do cliente.

## 6. PDF
Abra Visualizar → Imprimir/PDF.
As imagens e assinaturas devem constar no documento.
Vídeos aparecem identificados pelo nome do arquivo, pois PDF não incorpora reprodução de vídeo.

## 7. Segurança
O bucket `veracist-media` é privado.
A aplicação gera URLs assinadas temporárias para visualização.
A Secret Key/service_role não é utilizada no PWA.

## Limites deste ciclo
- Limite configurado: 50 MB por arquivo.
- Até 15 mídias por ocorrência na interface.
- Mídias antigas do Cloud 1.1 que estavam apenas no IndexedDB do aparelho não são migradas automaticamente.
- O PWA ainda não possui fila offline de upload; se estiver sem internet, salve as mídias quando a conexão estiver disponível. A fila offline será tratada no Cloud 1.4.
