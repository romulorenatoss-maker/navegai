# Testes executados

## Build

Comando:

```powershell
$env:PATH = "$PWD\.tools\node-v24.15.0-win-x64;$env:PATH"; npm.cmd run build
```

Resultado: passou.

Observacoes: o Vite exibiu avisos ja existentes sobre chunks grandes, browserslist desatualizado e imports dinamicos/estaticos. Nao houve erro de build.

## Diff check

Comando:

```powershell
git diff --check
```

Resultado: passou.

Observacoes: o Git exibiu apenas avisos de conversao LF/CRLF do Windows.

## Print mobile/desktop

Arquivos:

- `mobile-tarefas-minhas.png`
- `desktop-tarefas-minhas.png`
- `playwright-metrics.json`

Limitacao: sem sessao autenticada local, `/tarefas/minhas` redirecionou para `/login`. A captura real do drawer autenticado precisa ser feita no preview logado do Lovable.

