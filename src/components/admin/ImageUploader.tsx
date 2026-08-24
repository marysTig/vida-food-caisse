import { useState, useRef } from "react";
import { UploadCloud, Camera, ImageIcon } from "lucide-react";
import { uploadImageToCloudinary } from "@/lib/cloudinary";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  className?: string;
}

export function ImageUploader({ value, onChange, className = "" }: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    try {
      setIsUploading(true);
      const url = await uploadImageToCloudinary(file);
      onChange(url);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      handleUpload(file);
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div 
        className={`relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl transition-colors cursor-pointer overflow-hidden
          ${isDragging ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <span className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            <span className="text-sm font-medium">Téléchargement...</span>
          </div>
        ) : value ? (
          <img src={value} alt="Preview" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground p-4 text-center">
            <UploadCloud className="h-8 w-8 opacity-50" />
            <span className="text-sm font-medium">Glissez une image ici ou cliquez</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input 
          type="file" 
          accept="image/*" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={onFileChange} 
        />
        <input 
          type="file" 
          accept="image/*" 
          capture="environment" 
          className="hidden" 
          ref={cameraInputRef} 
          onChange={onFileChange} 
        />
        
        <button 
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <ImageIcon className="h-4 w-4" /> Galerie
        </button>
        <button 
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <Camera className="h-4 w-4" /> Caméra
        </button>
      </div>
    </div>
  );
}
