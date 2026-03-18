
UPDATE lead_historico 
SET tipo_evento = 'conversao_cliente',
    descricao = 'Lead convertido — vinculado ao cliente existente (telefone/CPF já cadastrado). OS criada aguardando número.'
WHERE tipo_evento = 'vinculo_cliente_existente';
