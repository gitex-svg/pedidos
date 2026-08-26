const businessMessages: Record<string, string> = {
  CARRIER_NOT_AVAILABLE: "A transportadora selecionada não está disponível.",
  CUSTOMER_NOT_AVAILABLE: "O cliente selecionado não está disponível.",
  ITEM_NOT_FOUND: "Este item não foi encontrado. Atualize o orçamento e tente novamente.",
  ORDER_HAS_ITEMS: "O orçamento possui itens e não pode ser alterado desta forma.",
  ORDER_NOT_FOUND: "Este orçamento não foi encontrado ou não está disponível para você.",
  ORDER_NOT_READY: "Inclua ao menos um item antes de finalizar o pedido.",
  ORDER_SUBMITTED: "Este pedido já foi finalizado e não pode mais ser alterado.",
  PAYMENT_TERM_NOT_AVAILABLE: "A condição de pagamento selecionada não está disponível.",
  PRICE_NOT_FOUND: "Não foi encontrado preço válido para este produto e cliente.",
  PRODUCT_NOT_AVAILABLE: "O produto selecionado não está disponível.",
  READ_ONLY: "Você não tem permissão para alterar este orçamento.",
  REPRESENTATIVE_NOT_AVAILABLE: "Não foi possível identificar o representante responsável.",
  TOTAL_OUT_OF_RANGE: "O total do pedido está fora do limite permitido.",
  VERSION_CONFLICT: "Este orçamento foi alterado por outra pessoa. Atualize a página e revise os dados.",
  VERSION_REQUIRED: "Não foi possível confirmar a versão atual do orçamento. Atualize a página e tente novamente.",
};

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown; response?: { data?: { code?: unknown } } };
  const code = candidate.response?.data?.code ?? candidate.code;
  return typeof code === "string" ? code : undefined;
}

export function getOrderErrorMessage(error: unknown): string {
  const code = errorCode(error);
  return (code && businessMessages[code]) || "Não foi possível concluir esta operação. Confira os dados e tente novamente.";
}