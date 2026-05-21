# O QUE O USUARIO ODEIA - PROIBICOES ABSOLUTAS

O usuario odeia:

- arquivo V2;
- tela paralela;
- fluxo paralelo;
- hook duplicado;
- service duplicado;
- RPC duplicada;
- trigger duplicada;
- arquivo antigo vivo sem uso;
- codigo morto comentado;
- gambiarra para resolver rapido;
- regra critica no frontend;
- historico editavel;
- scan global desnecessario;
- renomeacao sem apagar referencia antiga;
- criar novo arquivo sem remover/substituir o antigo;
- resolver bug criando outro caminho;
- deixar imports apontando para arquivo velho;
- mexer em tela que nao e renderizada;
- mudar layout inteiro para corrigir detalhe;
- usar nomes genericos como Novo, V2, Refatorado, Corrigido, Temp, Legacy, Old, Copy, Backup.

Regra obrigatoria:

Se precisar reescrever, faca uma destas opcoes:

1. sobrescrever o arquivo atual inteiro, se ele ainda for o arquivo renderizado;
2. criar arquivo com nome correto, migrar todos os imports/rotas/usos e apagar o arquivo antigo no mesmo diff.

Nunca deixar os dois vivos.

No final, sempre provar:

- arquivos criados;
- arquivos alterados;
- arquivos deletados;
- imports migrados;
- grep/checagem mostrando que o arquivo antigo nao e mais usado.
