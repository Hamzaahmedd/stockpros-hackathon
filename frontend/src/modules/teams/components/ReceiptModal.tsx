import { formatPaisa } from "@/modules/plans/utils";
import { Modal } from "@/shared/components/Modal";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { teamService } from "../services";
import type { TeamReceipt } from "../types";
import { apiErrorMessage, formatDate } from "../utils";

interface ReceiptModalProps {
  /** The transaction to show; null keeps the dialog closed. */
  transactionId: string | null;
  onClose: () => void;
}

const receiptRows = (receipt: TeamReceipt): [string, string][] => [
  ["Reference", receipt.referenceNumber],
  ["Workspace", receipt.teamName],
  ["Billed to", receipt.billedTo],
  ["Item", receipt.description],
  ["Seats", String(receipt.seatCount)],
  ...(receipt.unitPricePaisa === null
    ? []
    : ([["Price per seat", formatPaisa(receipt.unitPricePaisa)]] as [string, string][])),
  ["Amount", formatPaisa(receipt.amountPaisa)],
  ["Status", receipt.status === "REFUNDED" ? "Refunded" : "Paid"],
  ["Paid on", formatDate(receipt.paidAt)],
  ...(receipt.paymentMethod ? ([["Payment method", receipt.paymentMethod]] as [string, string][]) : []),
];

export function ReceiptModal({ transactionId, onClose }: ReceiptModalProps) {
  const [receipt, setReceipt] = useState<TeamReceipt | null>(null);

  useEffect(() => {
    if (!transactionId) return;
    let cancelled = false;
    setReceipt(null);
    teamService
      .getReceipt(transactionId)
      .then((loaded) => {
        if (!cancelled) setReceipt(loaded);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(apiErrorMessage(err, "Failed to load receipt"));
        onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [transactionId, onClose]);

  const handleDownload = async () => {
    if (!receipt) return;
    // Loaded on demand: the PDF library is large and only needed here.
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("StockPros — Payment receipt", 20, 24);
    doc.setFontSize(11);
    receiptRows(receipt).forEach(([label, value], index) => {
      doc.text(`${label}: ${value}`, 20, 42 + index * 9);
    });
    doc.save(`receipt-${receipt.referenceNumber}.pdf`);
  };

  return (
    <Modal
      isOpen={transactionId !== null}
      onClose={onClose}
      title="Payment receipt"
      description={receipt?.referenceNumber}
    >
      {receipt === null ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-4">
          <dl className="divide-y divide-border rounded-lg border border-border text-sm">
            {receiptRows(receipt).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-3 py-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Close
            </Button>
            <Button type="button" className="flex-1" onClick={() => void handleDownload()}>
              Download PDF
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
