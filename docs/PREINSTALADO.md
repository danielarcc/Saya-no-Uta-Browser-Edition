# Conteúdo pré-instalado (v0.3.1)

Este modo **não altera o menu nem a interface**. O servidor serve arquivos estáticos de `public/content/`, e a engine lê `public/content/index.json` automaticamente ao abrir. Não existe upload nem importação no navegador para iniciar um pacote pré-instalado. É um carregador genérico, não um conversor automático de NPS ou um mecanismo de reprodução de conteúdo proibido.

## Ativar o exemplo não explícito

```bash
bash scripts/enable-preinstalled-demo.sh
npm install
npm run dev
```

Abra o endereço do Vite e clique em **Start**. A história de demonstração de cinco arquivos começa automaticamente. **Continue** recupera um save criado nesse conteúdo, inclusive depois de fechar a aba. O importador manual ainda está disponível como opção; uma seleção manual tem efeito até recarregar a página. Ao recarregar, a aplicação prioriza o pacote pré-instalado. Para desativar o modo automático: `bash scripts/disable-preinstalled.sh`.

**Versão compilada:** após modificar `public/content`, rode `npm run build` para copiar os arquivos atualizados para `dist/content/`. Em desenvolvimento (`npm run dev`), não precisa recompilar. Os arquivos de conteúdo são carregados sob demanda; não são copiados para IndexedDB nem enviados ao navegador de uma vez.

## Contrato do futuro preparador Python

O preparador deverá escrever um arquivo `public/content/index.json` e copiar os roteiros e recursos **compatíveis e permitidos** para `public/content/`, preservando caminhos relativos.

```json
{
  "schema": 1,
  "enabled": true,
  "id": "minha-experiencia",
  "version": "1.0.0",
  "title": "Minha experiência NPS",
  "entry": "story/inicio.nps",
  "textMode": "nvl",
  "timing": {"waitMs": 1, "effectMs": 10},
  "scripts": {"story/inicio.nps": "scripts/story/inicio.nps"},
  "assets": {"cena": "assets/cena.png", "trilha": "audio/trilha.ogg"}
}
```

- Chaves de `scripts` são os **nomes lógicos de roteiro** utilizados pelos saltos NPS. Os valores são caminhos de arquivo relativos a `public/content/`.
- Chaves de `assets` são as **referências lógicas** que aparecem nos comandos NPS (`SRC`); os valores são caminhos relativos a `public/content/`.
- `entry` é o roteiro inicial, opcionalmente `story/inicio.nps#marcador`.
- Os próprios scripts determinam as transições de capítulo. Não se deduz ordem numérica nem se avança sem comando de salto.
- Todos os caminhos precisam ser locais e seguros, sem `..`, URL externa, caminho absoluto ou namespaces reservados.
- Em `version`, use uma versão **nova** quando alterar roteiro, recursos ou mapeamentos, para não reutilizar saves incompatíveis. `id` deve permanecer estável entre atualizações da mesma experiência.
- `index.json` ausente/`enabled:false` desativa o modo pré-instalado. Uma configuração inválida gera erro visível; não é ignorada.
- A engine não interpreta arquivos `.nut` e ainda não implementa todos os comandos NPS. O preparador não deve declarar como compatível um roteiro com comandos e dependências não suportados.

## Fluxo previsto

2. Você executa `npm run dev` (ou `npm run build` para gerar a versão compilada).
3. O navegador carrega o manifesto automaticamente. **Start** usa `entry`; **Continue** usa saves daquele conteúdo.

Os recursos não devem ser publicados sem autorização dos respectivos titulares. Não utilize este fluxo para reproduzir cenas sexuais envolvendo personagens de aparência infantil.
