# Requisitos do Sistema PATO

Referência normativa: Resolução DNIT nº 8, de 6/11/2023, e seus anexos; Manual de Conservação Rodoviária (IPR 710); Norma DNIT 182/2018-PRO; Portaria DNIT nº 1.977/2017; IN DNIT nº 62/2021.

## 1. Objetivo

Gerar o PATO de contratos de conservação rodoviária com cada quantidade rastreável até sua origem, aplicando automaticamente as exigências da Res. 8/2023 e produzindo as planilhas exigidas no art. 33.

## 2. Fluxo (art. 19)

1. Inventário dos elementos geradores de conservação (Anexos II e III)
2. Condição e intensidade dos serviços (ICP, roçada, grupo de desempenho)
3. Quantidades pelos níveis de esforço e pelo histórico executado
4. Quantificação dos DSM por memória de cálculo direta (art. 24, § 6º)
5. Preços, transportes, consolidação, validação e saídas

## 3. Módulos

| Módulo | Situação | Regra |
|---|---|---|
| Cabeçalho e SNV | Calculado | Segmentos cobrem o trecho; conferência com a planilha oficial do SNV |
| Inventário | Entrada | Resumo do inventário e quantidades de cadastro |
| ICP e histórico (Anexo XXVII) | Calculado | ICP = 50·panela + 30·remendo + 20·trinca (Alta 1, Média 0,5, Baixa 0,25). Condição: < 30 bom, < 50 regular, < 70 ruim, demais péssimo. km por intervenção arredondado para cima. Quantidade = máx(km × NE × multiplicador, histórico) |
| Roçada (DNIT 182/2018-PRO) | Calculado | NERp = Σ(NERe/d) ÷ Σ(1/d) das estações; sugerido = arredondar(NERp) + 1 |
| Grupo de desempenho I | Calculado | Qtd/km = trunc(qtd total × NE × frequência ÷ extensão, 3); R$/km/mês = trunc(Σ qtd/km × PU ÷ 12, 2); R$/mês = trunc(R$/km/mês × extensão, 2) |
| FIT (Anexo VI) | Calculado | FIT = 1 + (A1 + A2) ÷ (DMTp × 60); A1 = 70 + 0,0035 × VMDf; A2 = 60 × DMTu |
| Transportes (Anexo VIII) | Calculado | Momento = trunc(qtd × consumo × DMT × FIT, 3), somado por caminhão e tipo de via |
| Linhas do PATO | Calculado | Quantidade = trunc ou round(base × fator, 3); parcial = trunc(qtd × PU, 2) |
| Resumo, curva ABC e contrato | Calculado | Condição mais vantajosa = menor total; curva ABC: A até 80%, B até 95%; contrato = conservação × prazo + DSM uma vez |
| Sinalização de obras (Anexo XIII) | Entrada | un.dia por dispositivo. Próxima etapa: calcular pela duração dos serviços |
| Preços SICRO e binômio | Entrada | Banco por código; binômio escolhe o menor custo total |
| Administração local, canteiro, usina, mobilização | Entrada | Próxima etapa: composição detalhada |
| Prorrogação (Anexo XXIV) e adequação (Anexo XXV) | Planejado | Vantajosidade, desconto adicional, deflator do art. 96 |

## 4. Modelo de dados

Cada projeto é guardado em partes, para respeitar o limite de 256 KiB por documento.

| Entidade | Campos |
|---|---|
| Projeto | nome, rodovia, trecho, subtrecho, segmento, kmIni, kmFim, extensao, snv, snvVersao, unidadeLocal, tipo, dataBase, aberturaLicitacao, prazoAnos, dataInventario |
| Segmento SNV | snv, tipoPista, kmIni, kmFim, latIni, lonIni, latFim, lonFim, revestimento, faixas, largura |
| Elemento de inventário | chave, rotulo, valor, unidade, grupo, fonte |
| Levantamento ICP | sentido (C/D), kmIni, kmFim, panela, remendo, trinca, intervPrim, intervSec |
| Regra ICP | id, servico, classes [coluna, intervenção], neExpr, unidade, neFonte, somaRegras |
| Histórico | regra, valor, contrato, medicao, memoria |
| Linha do PATO | id, item, origem, codigo, descricao, baseExpr, unidadeBase, fatorExpr, unidade, modo (trunc, round, icp), casas, icpRegra, justificativa |
| Grupo | item, titulo, linha |
| Preço | codigo, descricao, unidade, sd, cd, fonte |
| Croqui | chave, material, origem, destino, LN, RP, P, Pu |
| FIT | frente, codigo, chave, vmdf |
| Bloco de transporte | id, frente, codigo, linhas [servico, material, origem, destino, consumoExpr, faixaPATO, colunaDMT, usaFIT, fitFrente] |
| Desempenho | codigo, grupo, qtdTotalExpr, ne, freqExpr, qtdPorKmExpr |
| Binômio | material, origens [origem, uf, local, aquisicao, transporte] |
| Cotação | material, codigoSicro, fornecedor, preco, unidade, densidade, data, dmtPav, dmtNaoPav |
| Gabarito | valores da planilha de origem por linha, totais, resumo |

### Origem da quantidade (art. 24, § 1º)

INVENTÁRIO, ICP, HISTÓRICO, SICRO (taxa da composição), PROD SICRO, RESOLUÇÃO, NOTA TÉCNICA, ESTIMATIVA, MANUAL, SMT, PRAZO PATO.

### Linguagem das expressões

`inv("chave")`, `qtd("L21")`, `base("L21")`, `fator("L21")`, `icp("RP")`, `icpKm("RP")`, `transp("id")`, `undia("frente", codigo)`, variáveis `ext`, `prazo`, `PI`, `neRocada`, `largura`; operadores `+ - * / ^` e parênteses. O avaliador não usa `eval`.

## 5. Regras de validação

| ID | Referência | Verificação |
|---|---|---|
| R01 | Art. 22, parágrafo único | Data-base com no máximo 1 ano até o início da licitação |
| R02 | Art. 6º, III | DSM limitados a 25% do orçamento inicial |
| R03 | Art. 9º | Prazo múltiplo de 1 ano |
| R04 | Art. 9º, § 3º | DSM não multiplicados pelo prazo na planilha contratual |
| R05 | Art. 5º, § 1º | Grupo de desempenho I em rodovia pavimentada |
| R06 | Art. 24, § 1º | Toda quantidade com origem declarada |
| R07 | Art. 17, § 2º | Tapa-buraco e remendo só sobre a pista |
| R08 | Art. 21 | Sem mão de obra ou equipamento como item |
| R09 | Art. 48, parágrafo único | Aquisição e transporte de betuminosos em itens próprios |
| R10 | Art. 46 | Binômio com ao menos 3 origens |
| R11 | Art. 25 | Engenheiro supervisor entre 0,25 e 1,00 |
| R12 | Art. 22 e art. 99 | Composições fora do SICRO justificadas |
| R13 | Art. 20, § 3º, e art. 33, I, a | SNV com versão e segmentos cobrindo o trecho |
| R14 | Organização | Numeração de itens única e coerente com o grupo |
| R15 | Art. 24, § 1º, e art. 84 | Histórico com contrato e medição de origem |
| R16 | Art. 19 e Anexo XXVII | ICP refletindo as duas faixas levantadas |
| R17 | Art. 27 | Roçada manual ou costal só com justificativa |
| R18 | Art. 24, § 4º | Frequência de roçada pela DNIT 182/2018-PRO |
| R19 | Art. 33, r e s | Preço com e sem desoneração em todas as linhas |
| R20 | Art. 44 e Anexo XIII | Sinalização de obras prevista |
| R21 | Art. 45 e Anexo IX | DMT de todo transporte vinda do croqui |
| R22 | Art. 18 e art. 24, § 1º | Estimativas com justificativa técnica |
| R23 | Integridade | Todas as expressões resolvidas |
| R24 | Art. 45 e Anexo VII | Cotação de pétreos e areia |
| R25 | Art. 20, § 1º, I | Segmentos conferem com o SNV vigente |

## 6. Formatos de importação

| Arquivo | Estrutura |
|---|---|
| Planilha PATO completa | Abas CAPA, PATO, BD, RESUMO_INVENT, ICP, CALCULO_ICP; opcionais CAD_SEG, CAD_PISTA, CROQUI, FIT, TRANSPORTES_CONSERVA, TRANSPORTES_DSM, DESEMPENHO, NE_ROCADA, UN_DIA, BINOMIO_ANP, RESUMO_PATO, QUANTIDADES |
| Inventário | Aba RESUMO_INVENT do modelo, ou colunas chave, valor, unidade |
| Levantamento ICP | Aba ICP do modelo, ou colunas km inicial, km final, sentido, panela, remendo, trinca, intervenção primária, intervenção secundária |
| Histórico | Colunas serviço (RL, TP, RP, COR, FSD, FSC, MICRO), quantidade, contrato, medição |
| SNV | Planilha oficial do SNV: código, km inicial, km final, extensão, superfície |
| Preços | Aba BD do modelo, ou colunas código, descrição, unidade, preço sem desoneração, preço com desoneração |
| Cotações | Colunas material, fornecedor, preço, unidade, data, município, DMT |

O ICM-Web é interno do DNIT; o levantamento entra por exportação em planilha.
