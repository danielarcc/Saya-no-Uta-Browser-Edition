# Compatibilidade NPS — v0.2.0

O inventário dos 39 NPS é técnico, sem texto narrativo. Os `.nut` são contêineres de bytecode SCRP/Squirrel; não há VM NUT nesta engine. O `.exe` não foi executado. Reconhecer uma tag não significa reproduzir todos os seus modos.

| Comando / recurso | Entregue | Limite |
|---|---|---|
| Texto, K/k | Pausa, histórico, texto progressivo; NVL acumula até CLEAR | K/k tratados igual; distinção nativa não comprovada |
| CLEAR | Limpa página/segmentos/escolhas; NVL pausa antes se há texto não confirmado | Pausa implícita é uma decisão de compatibilidade |
| I, /I, II | Itálico; II como alias de abertura | II é inferido; não há fonte original |
| CENTER | Alinhamento central | Não é um renderer HTML |
| BOX | Caixa original f05 na leitura NVL; tipo 5 sem fundo | Mapeamento e geometria nativos de 5/8/9 incompletos |
| BACKGROUND | Imagem/cor preparada para WIPE; marcação SHADE | EX avisa e não seleciona variantes automaticamente |
| BUSTUP | Mapeamento NAME/FACE, entrada/saída, alinhamento/escala/offsets | Tabelas compiladas não foram reconstruídas; ancoragens configuráveis no manifesto |
| LAYER | Ordem por NUM, X/Y, escala, transparência, remoção | Sem modos de mistura proprietários |
| WIPE normal | Commit imediato | Implementado |
| WIPE fade | Crossfade linear | Curva/gamma/timing não medidos no original |
| WIPE effect | Máscara grayscale original; rampa suave por pixel | Não é mais fallback de fade; orientação/curva ainda não confirmadas no executável |
| WAIT | TIME × waitMs | Padrão 1 ms, inferido |
| FLASH | Flash de cor e COUNT, com fade | Mínimo 80 ms; WAIT/EFFECT nativos específicos não emulados |
| SCROLL | Interpolação de camada até X/Y por TIME × COUNT | Semântica nativa de passos não confirmada |
| BGM / SE / VOICE | Canais separados, volume, loops, fades, voz no backlog | Depende de codec do browser; áudio não foi ouvido no browser nesta etapa |
| BGM OLD=fadeout | Sobreposição real da fonte anterior e da nova | Agora simultâneo, mas não compara envelopes ao executável |
| BGM COUNT | Aviso, respeita LOOP | Loop parcial por intervalos ainda não implementado |
| MARKER / A | Saltos locais/entre arquivos, condicionais | Sem CALL/RETURN; destinos ausentes são erro |
| A OPERATOR | Condição; `a=1` é igualdade | Não atribui variável |
| CALC | Aritmética/booleanos, prefixo $, variáveis locais/globais | Sem strings/arrays/objetos/Squirrel |
| CHOICE | Texto, bitmaps, frames, hover/foco, disabled, ONSE/PUSHSE | Cadência de frames 90 ms; distinção interna entre TYPE 9/10/17 não completa |
| CHOICE OPERATOR | Vazio aceito; não vazio causa erro | Não é silenciosamente ignorado |
| SELECT | Pausa por escolha; MouseDownR quando configurado | CURSORNAME próprio ainda não emulado; cursor de espera usa eye original |
| LOAD / SYSTEM load/save | Painéis reais de armazenamento | Sem save binário do executável |
| SYSTEM config | Configuração funcional local | Imagens N4_sys ausentes; painel aproximado |
| SYSTEM cgmode | Galeria do whitelist `gallery` | Não interpreta cglist.txt/flags nativos; só material revisado |
| SYSTEM music | Biblioteca do manifesto | Extensão desta engine; não substitui o music.nps original inteiro |
| SYSTEM ending/credits | Créditos originais na ordem | Rolagem manual, sem cadência final nativa |
| SYSTEM savemode | Permissão de salvar | Leitura continua disponível |
| SYSTEM Shading/extraCG | Blur de 8px / brilho 0,45 em fundos SHADE | Valores aproximados; aplicados no próximo commit |
| SYSTEM INIT | Limpa variáveis locais/texto/escolhas | Não reinicializa todas as estruturas do motor original |
| SYSTEM MENU | Máscara registrada no estado, com aviso | Bits nativos ainda não mapeados aos controles |
| SYSTEM url | Bloqueia URL externa e avisa | Execução local |
| INCLUDE | Arquivo vazio/comentários | DEFINE/macros são erro |
| /A, /PRE, /BODY, /HTML | Fechamentos estruturais ignorados explicitamente | Sem HTML arbitrário |
| END | Encerra roteiro e oferece retorno | Não fecha janela do navegador |
| MOVIE / tags desconhecidas | Erro com arquivo e linha | Strict padrão; permissivo é apenas diagnóstico |

## Expressões e ramificações

`+ - * / %`, `= == != < > <= >=`, `&& || !`, parênteses, sinais unários, números, identificadores Unicode. Variável ausente vale zero; divisão por zero é erro. Não usa `eval`/`Function`. Ramificações por `A OPERATOR` e escolhas são testadas no modo de desenvolvimento; nenhuma escolha foi inventada para o fragmento original linear incluído.

## Estado e saves

Preservados roteiro, próxima instrução, cena preparada/visível, texto NVL, início do segmento, escolhas, variáveis locais, backlog e falas lidas. Música/loops restauram posição. Configurações e globais persistem separadamente. Restore valida endereço antes de modificar a sessão. A versão do manifesto impede importar saves da estrutura anterior.

Não são gravados estados intermediários de transição. Voz e efeitos não-loop não retomam no meio. O conjunto de falas já lidas é combinado ao carregar. Backlog é limitado a 500 entradas.

## Recursos que faltam nos arquivos de origem

As strings dos scripts `product_config.nut` e `product_saveload.nut` referenciam `N4_sys/config/*` e `N4_sys/saveload/*`. Nenhum desses recursos consta no ZIP fornecido. `n1_system.nut` referencia `face.ini`; ele também não consta, e não há TTF/OTF original no arquivo.

A caixa, a máscara de efeito, os botões de contexto, os fundos do título/bibliotecas e os créditos disponíveis foram reutilizados. A tipografia local Liberation Serif e o layout de save/load/configurações não são apresentados como os originais. O layout lógico usa 1280 × 960, observado nas imagens originais.

## Não concluído

VM NUT/Squirrel, máscaras de MENU, atlas/tabelas nativas completos, todos os BOX, loops parciais de áudio, vídeos, saves nativos, galerias completas, capítulos/finais restantes, rollback, integração da história inteira e comparação frame a frame com o executável. A entrega continua parcial e inclui somente o trecho não explícito revisado.

## Atualização v0.3: importação

A produção agora utiliza pacotes importados; o recorte fixo descrito na v0.2 é somente referência legada. Caminhos relativos entre scripts, incluindo ../ dentro da raiz, são resolvidos e verificados. Arquivos/labels ausentes e comandos não suportados bloqueiam instalação ou interrompem execução com diagnóstico; não há promessa de interpretar todo NPS proprietário. O importador aceita apenas INCLUDE de comentários, sem macros. O fluxo entre arquivos é definido por A/HREF/CHOICE/SELECT; EOF sem salto encerra a leitura, sem retorno automático.

Os recursos de interface, coordenadas e limitações visuais da v0.2 continuam os mesmos. Os documentos IMPORTACAO.md e ALTERACOES-v0.3.md descrevem o novo fluxo e prevalecem sobre referências históricas ao Start fixo.
