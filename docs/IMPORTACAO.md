# Pacotes locais — v0.3

Importe uma pasta ou ZIP pelo painel. Não é necessário um manifesto nem editar o código da engine. Quando não há raiz única no grafo dos saltos, selecione arquivo e marcador no painel. Mesmo uma raiz única é apenas uma sugestão estrutural, não prova de que seja o começo narrativo correto.

Um nps-package.json opcional permite declarar informações do próprio conteúdo:

```json
{
  "title": "Minha história",
  "entry": "story/inicio.nps#abertura",
  "width": 1280,
  "height": 960,
  "textMode": "nvl",
  "assets": {"cafe": "media/cafe.png"},
  "characters": {"ana|normal": "media/ana_normal.png"},
  "timing": {"waitMs": 1, "effectMs": 10}
}
```

transitionMask opcional aponta para imagem grayscale. textMode replace troca o texto a cada fala; nvl acumula até CLEAR. Referências de BUSTUP sem SRC usam characters ou buscam NAME_FACE. Exemplo de ligação: `<A HREF="capitulo2.nps#entrada">`; marcadores usam `<MARKER NAME="entrada">`. Atributos e comandos aceitos estão em COMPATIBILIDADE.md; consulte também os roteiros de examples/pacote-permitido.

O compilador inspeciona todos os roteiros, inclusive os não alcançáveis. Resolve referências em cópias internas; não modifica o ZIP enviado. Erros impedem ativação. Áudio/imagens são armazenados como Blobs e recebem URLs locais temporárias durante a leitura. Formato de mídia reconhecido não garante que um arquivo corrompido possa ser decodificado; falhas de carregamento em execução são apresentadas pela engine.

A análise ocorre em Worker cancelável. Cancelar/erro não substitui o pacote ativo. A instalação usa uma transação IndexedDB para catálogo, pacote e seleção. Limites de tamanho e CRC do ZIP são verificados; arquivos executáveis e extensões não aceitas são ignorados. Não há interpretação NUT ou extração de arquivos proprietários criptografados.

A identidade é SHA-256 dos caminhos normalizados e bytes. Empacotamento ZIP diferente com os mesmos caminhos/bytes mantém a identidade; renomear a pasta raiz ou editar capítulos muda a identidade. Não há migração de saves entre revisões. O armazenamento fica sujeito à quota e às políticas de retenção do navegador. Exportar save não exporta o pacote.

Continue usa o save compatível mais recente. Start usa uma ponte reservada no menu que limpa variáveis locais, ativa saves e inicia o arquivo/marcador selecionado. Não busca uma cena pré-programada. O menu continua usando as imagens, posições e opções da v0.2. Somente a ligação de Start é substituída; os controles Importar/Continue são adicionais na barra existente.
