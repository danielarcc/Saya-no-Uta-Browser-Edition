# Continuidade da v0.1 → v0.2

O trabalho foi realizado nos mesmos arquivos `App.tsx`, `vm.ts`, `renderer.ts`, `audio.ts`, `storage.ts`, `types.ts`, CSS e infraestrutura de testes. Parser e expressões da v0.1 foram preservados. Não foi criado um projeto alternativo.

## Experiência principal

A tela de lançamento técnica, cabeçalho NPS e identificação de engine deixaram o caminho principal. O menu original aparece assim que os recursos locais carregam. As sete opções de título levam a funcionalidades reais: trecho de leitura, load, configuração, galeria selecionada, música, créditos e encerramento/retorno.

Os roteiros da sala verde foram movidos para `scripts/dev/`, com manifesto e ID de armazenamento próprios. Eles não aparecem em Start na aplicação principal.

## Material original selecionado

Incluídos caixas f01–f06, seleção select01/select02, cursor eye, máscara effect, botões data/menu e fundos das bibliotecas. O trecho da cafeteria usa cinco sprites de expressão, dois cenários, 15 vozes e duas músicas locais. Nenhuma galeria ou narrativa não revisada é carregada.

## Motor

- NVL: acumulação até CLEAR, ponto de revelação de texto e backlog somente do segmento novo.
- Pausa implícita antes de CLEAR/VOICE/END quando há texto ainda não apresentado em uma pausa; evita a perda de texto observada nos roteiros sem K ao final de determinados parágrafos. É uma decisão de compatibilidade, não uma semântica nativa comprovada.
- WIPE effect: aplicação da máscara original por luminância, com borda suave e endpoints exatos.
- BGM OLD fadeout: manutenção da fonte anterior durante o fade da nova.
- SYSTEM: filtros opcionais em fundos marcados, acesso a galeria/música/save/load/backlog.
- Restore valida a posição antes de alterar a execução e mantém o conhecimento de texto lido.
- CHOICE OPERATOR não vazio agora falha explicitamente; não é ignorado como antes.

## Interface funcional

Menu de leitura bitmap, histórico em tipografia local, quick save/load, opacidade de texto, saves paginados, galeria selecionada e biblioteca de duas faixas. A página principal não depende de recursos remotos.

## Ainda não resolvido

`N4_sys`/`face.ini`/fonte original ausentes; layout exato de painéis, timing, posicionamento e máscaras de MENU não comprovados; VM NUT não implementada; sem importação de saves nativos. Ausência de validação visual final no navegador está registrada em TESTES.md. O projeto segue parcial.
