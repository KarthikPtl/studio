"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Image from 'next/image';
import { UploadCloud, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  imageUrl: string | null;
  setImageUrl: (url: string | null) => void;
  setFile: (file: File | null) => void;
  className?: string; // Added className prop
}

export function ImageUploader({ onImageUpload, imageUrl, setImageUrl, setFile, className }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setIsDragging(false);
      if (acceptedFiles && acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        // No need for FileReader here if handleImageUpload expects a File
        setImageUrl(URL.createObjectURL(file)); // Create temporary URL for preview
        setFile(file);
        onImageUpload(file); // Pass the File object directly
      }
    },
    [onImageUpload, setImageUrl, setFile]
  );

   // Cleanup temporary URL when component unmounts or imageUrl changes
   React.useEffect(() => {
     return () => {
       if (imageUrl && imageUrl.startsWith('blob:')) {
         URL.revokeObjectURL(imageUrl);
       }
     };
   }, [imageUrl]);


  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [] },
    multiple: false,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
  });

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the dropzone click
    if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl); // Clean up blob URL
    }
    setImageUrl(null);
    setFile(null);
    // Optionally call a prop function to notify parent about clearing
    // onImageClear?.();
  };

  return (
    <Card className={cn("border-2 border-dashed hover:border-primary transition-colors h-full", isDragging || isDragActive ? "border-primary bg-accent/10" : "", className)}>
      <CardContent
        {...getRootProps()}
        className={cn("relative flex flex-col items-center justify-center p-6 min-h-[200px] cursor-pointer text-center h-full")} // Added h-full
      >
        <input {...getInputProps()} />
        {imageUrl ? (
          <>
            <Image
              src={imageUrl}
              alt="Uploaded Math Expression"
              width={400}
              height={200}
              className="max-h-[300px] w-auto object-contain rounded-md"
              data-ai-hint="math equation"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              className="absolute top-2 right-2 bg-background/80 hover:bg-destructive/80 hover:text-destructive-foreground rounded-full z-10" // Ensure button is clickable
              aria-label="Clear image"
            >
              <X className="h-4 w-4" />
            </Button>
            <p className="mt-4 text-sm text-muted-foreground">Drag 'n' drop a new image here, or click to replace</p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <UploadCloud className="h-12 w-12" />
            <p className="font-semibold text-foreground">
              {isDragActive ? "Drop the image here..." : "Drag 'n' drop an image here, or click to select"}
            </p>
            <p className="text-xs">Supports JPG, PNG</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
