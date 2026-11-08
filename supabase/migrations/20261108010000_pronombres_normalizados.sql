-- Pronombres viejos venían como "Ella/ella" o "Él/él, Elle/elle" (de la
-- planilla). Se dejan como los guarda hoy la app: "Ella", "Él, Elle".
update equipo
set pronombres = regexp_replace(pronombres, '/(ella|él|elle)', '', 'gi')
where pronombres ~* '/(ella|él|elle)';
