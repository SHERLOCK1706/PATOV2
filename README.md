# Sistema PATO SR/DNIT/MT

Protótipo de sistema para elaborar o Plano Anual de Trabalho e Orçamento (PATO) de contratos de conservação rodoviária, seguindo a Resolução DNIT nº 8, de 6/11/2023.

O sistema lê uma planilha PATO no modelo usado pela SR/MT, recalcula todas as quantidades e preços a partir dos dados de entrada (inventário, ICP, histórico, croqui, transportes e preços), aplica as verificações da resolução e gera as saídas em Excel.

## Critério de aceite

O motor precisa reproduzir, linha a linha, uma planilha PATO aprovada usando apenas os dados de entrada dela. Com a planilha da BR-158/MT (km 326,00 ao km 416,80) o resultado é:

- 190 de 190 linhas iguais (quantidade, parcial sem desoneração e parcial com desoneração)
- Total sem desoneração igual: R$ 33.796.213,71
- Planilha contratual igual quando os DSM são multiplicados pelo prazo, como na origem: R$ 67.592.428,24
- Total com desoneração diferente em R$ 3.202,41, porque o subtotal do item 02.02 da planilha de origem deixa de fora a sinalização de obras do DSM 2.2

```
npm install
npm run conferir -- caminho/para/PATO.xlsx
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/engine.js` | Motor de cálculo e regras de validação (sem dependências) |
| `src/importer.js` | Leitura da planilha PATO e dos arquivos avulsos (usa SheetJS) |
| `src/app.js` | Interface da página |
| `src/index.template.html` | Estilos e esqueleto da página |
| `tools/build.js` | Junta tudo em `dist/sistema-pato.html` |
| `tests/conferencia.js` | Conferência com uma planilha PATO aprovada |
| `docs/REQUISITOS.md` | Requisitos, modelo de dados, regras e formatos de importação |

```
npm run build
```

## Dados

Nenhuma planilha, orçamento ou cotação fica neste repositório. O orçamento de referência pode ser sigiloso (art. 24 da Lei nº 14.133/2021 e art. 53, § 2º, da Res. 8/2023), por isso o `.gitignore` bloqueia arquivos `.xlsx`. Os projetos ficam na base da página publicada.
