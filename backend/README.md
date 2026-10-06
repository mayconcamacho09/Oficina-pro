# Oficina Pro v10 — backend operacional

Esta versão inclui a estrutura do projeto v7 e uma API inicial com autenticação por token, senhas com hash bcrypt, banco SQLite, limite de tentativas de login e endpoints de dados genéricos.

## Requisitos
- Node.js 20 ou superior
- npm

## Executar localmente
1. Abra um terminal nesta pasta `backend`.
2. Copie `.env.example` para `.env`.
3. Gere um segredo forte (ex.: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) e configure `JWT_SECRET`.
4. Altere `ADMIN_PASSWORD` para uma senha exclusiva com pelo menos 12 caracteres. Nunca publique o `.env`.
5. Execute `npm install` e depois `npm start`.
6. Acesse `http://localhost:3000/api/health`. A interface estática pode ser servida pelo mesmo endereço.

## Endpoints da API
- `POST /api/auth/login` com `{ "username": "admin", "password": "..." }` retorna token Bearer.
- `GET /api/me` exige `Authorization: Bearer <token>`.
- `GET /api/data/:collection` exige token e retorna registros.
- `PUT /api/data/:collection` exige token e recebe `{ "records": [{"id":"...", "campo":"valor"}] }`.

Coleções permitidas: identificadores minúsculos com letras, números, `_` e `-` (2–40 caracteres). O banco `oficina.sqlite` é criado automaticamente.

## Importante: integração e publicação
A interface herdada da v7 ainda usa `localStorage` diretamente; ela **não foi migrada automaticamente** para ler/gravar nesta API. Portanto, este pacote é uma backend operacional executável, não uma instalação multiusuário já pronta. Para uso real, é necessário conectar cada módulo ao endpoint, definir permissões por ação no servidor, validar os campos de negócio, criar gestão de usuários e executar testes de fluxo. SQLite serve para uma instância pequena; para hospedagem multiinstância, use PostgreSQL e HTTPS. Não exponha o servidor diretamente à internet sem configuração de produção, backups e revisão de segurança.
