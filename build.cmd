@echo off
setlocal DisableDelayedExpansion

set "ENV_FILE=C:\repos\fair-hiring-protocol\api\.env"

if exist "%ENV_FILE%" (
	for /f "tokens=*" %%i in ('type "%ENV_FILE%" ^| findstr /r "^DATABASE_URL="') do set "%%i"
)

if not defined DATABASE_URL (
	echo Missing required env var DATABASE_URL in %ENV_FILE%.
	exit /b 1
)

set "DB_URL=%DATABASE_URL%"
if /i "%DB_URL:~0,13%"=="postgresql://" (
	set "DB_URL=%DB_URL:~13%"
) else if /i "%DB_URL:~0,11%"=="postgres://" (
	set "DB_URL=%DB_URL:~11%"
) else (
	echo Invalid DATABASE_URL format. Expected postgres:// or postgresql://
	exit /b 1
)

for /f "tokens=1,2 delims=@" %%a in ("%DB_URL%") do (
	set "DB_AUTH=%%a"
	set "DB_AFTER_AT=%%b"
)

for /f "tokens=1,* delims=:" %%a in ("%DB_AUTH%") do (
	set "POSTGRES_USER=%%a"
	set "POSTGRES_PASSWORD=%%b"
)

for /f "tokens=1,* delims=/" %%a in ("%DB_AFTER_AT%") do (
	set "DB_HOSTPORT=%%a"
	set "DB_NAME_RAW=%%b"
)

for /f "tokens=1 delims=?" %%a in ("%DB_NAME_RAW%") do set "POSTGRES_DB=%%a"

if not defined POSTGRES_USER (
	echo Could not parse DB user from DATABASE_URL.
	exit /b 1
)
if not defined POSTGRES_PASSWORD (
	echo Could not parse DB password from DATABASE_URL.
	exit /b 1
)
if not defined POSTGRES_DB (
	echo Could not parse DB name from DATABASE_URL.
	exit /b 1
)

docker rm -f fhp-postgres >nul 2>&1
docker run --name fhp-postgres -e "POSTGRES_PASSWORD=%POSTGRES_PASSWORD%" -e "POSTGRES_DB=%POSTGRES_DB%" -e "POSTGRES_USER=%POSTGRES_USER%" -p 5433:5432 -d postgres:latest
if errorlevel 1 (
	echo Failed to start docker container fhp-postgres.
	exit /b 1
)

timeout /t 5 /nobreak >nul
docker ps --filter "name=fhp-postgres" --filter "status=running" | findstr /i "fhp-postgres" >nul
if errorlevel 1 (
	echo fhp-postgres exited during startup. Container logs:
	docker logs fhp-postgres
	exit /b 1
)

cd C:\repos\fair-hiring-protocol\db\migrations
powershell -Command "Get-ChildItem *.sql | Sort-Object Name | ForEach-Object { Write-Host \"Running $($_.Name)...\"; Get-Content $_.FullName | docker exec -i fhp-postgres psql -v ON_ERROR_STOP=1 -U %POSTGRES_USER% -d %POSTGRES_DB% }"
if errorlevel 1 (
	echo Migration step failed.
	exit /b 1
)

cd C:\repos\fair-hiring-protocol\api
npm run dev